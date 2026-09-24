# CloudBase PostgreSQL 表结构与权限说明

当前前端通过 `window.ExperimentStore` 统一读写数据；实现层已经从文档数据库切换为 CloudBase PostgreSQL，浏览器端保留 `localStorage` 兜底，但正式实验数据应落到 PG 表。

## 核心表

这套平台只需要先落这 7 张业务表：

- `participant_sessions`
- `preference_responses`
- `assigned_feeds`
- `feed_summaries`
- `feed_events`
- `completion_records`
- `audit_logs`

前端仍然用同一组集合名调用 `window.ExperimentStore.upsert()` / `append()` / `readAll()`，只是底层改为 `app.rdb()` 访问 PG。

## 素材表

素材改为动态加载后新增两张表，由 `20260924100000_create_video_asset_tables.sql` 创建：

- `video_assets` — 每条素材一行，记录云存储路径、类别、展示元数据与审核状态
- `video_upload_batches` — 一次批量上传一行，便于按批审核

这两张表**不走** `window.ExperimentStore`。`readAll()` 会把所有被试数据表全量拉一遍，几百条素材混进去会拖慢入口页，因此素材查询由 `src/lib/assets.js` 单独用 `app.rdb()` 完成。

### 池归属

`in_core_pool` 与 `in_tracking_pool` 两个布尔列决定素材服务哪个研究。用两列而不是单个 `pool_tag`，是因为同一条素材可以同时属于两个池——回填的原有 100 条就是如此。

`assigned_feeds.pool_tag` / `pool_version` / `pool_size` 记录被试实际抽取自哪个池。`pool_version` 是该池成员集合的指纹（见 `src/lib/assets.js`），只有在素材集合完全相同时两个 session 才会得到同一个值。改用指纹而非自增计数，一是启停素材时无需回写整张表，二是它直接回答了被试间分析真正关心的问题：这两名被试看的是不是同一批素材。

### 权限与其他表不同

其余业务表对 `anon` 开放全部读写，因为被试需要匿名写入实验数据。素材表不能沿用这套：`src/config/cloudbase.js` 中的 publishable key 对任何打开网页的人可见，给 `anon` 写权限等同于对公网开放写入。

因此：

- `anon`：仅 `SELECT`，且 RLS 限定 `status = 'active' AND enabled = true`，待审核素材查询不到
- `authenticated`：全部操作，上传与审核都要求真实登录

对应地，`admin.html` 与 `upload.html` 的登录已改为真实的 CloudBase 会话校验（`src/lib/admin-auth.js`），不再使用仅切换界面显示的 `sessionStorage` 标记。

### 追踪已看素材

`tracking_participants.seen_sample_ids` 为有序 `jsonb` 数组（旧→新），记录研究 3 被试已经看过的 `sample_id`。每次任务结束时由 `src/runner/runner.js` 追加，生成序列时用于优先未看过的素材。


## 字段设计原则

- 业务主键统一用 `text`。
- 前端仍保持 camelCase 形状；PG 物理列使用 snake_case。
- 结构化字符串、时间戳、计数值分别存成 `text`、`timestamptz` / `bigint`、`integer`。
- 数组与对象字段存为 `jsonb`，例如：
  - `selected_categories`
  - `selected_category_labels`
  - `screen`
  - `recommendation_rule`
  - `video_sequence`
  - `events`
  - `payload`

## 表结构草案

实际 migration 文件在：

```text
cloudbase/migrations/20260909120000_create_short_video_experiment_tables.sql
cloudbase/migrations/20260909220000_add_feed_exit_epoch_ms.sql
cloudbase/migrations/20260918120000_add_condition_manipulation_fields.sql
```

已经创建 7 张表的环境只需执行第二个增量 migration，即可增加 `feed_summaries.exit_epoch_ms`，不会删除已有记录。

建议由该 migration 创建以下列：

### `participant_sessions`

- `id text primary key`
- `session_id text unique not null`
- `participant_name text`
- `source text`
- `study text`
- `condition text`
- `entry_url text`
- `return_url text`
- `status text`
- `started_at bigint`
- `pre_questionnaire_submitted_at bigint`
- `feed_started_at bigint`
- `completed_at bigint`
- `user_agent text`
- `screen jsonb`
- `selected_categories jsonb`
- `completion_code text`
- `created_at timestamptz`
- `updated_at timestamptz`

### `preference_responses`

- `id text primary key`
- `session_id text`
- `participant_name text`
- `study text`
- `condition text`
- `selected_categories jsonb`
- `selected_category_labels jsonb`
- `min_selected integer`
- `max_selected integer`
- `submitted_at timestamptz`
- `created_at timestamptz`
- `updated_at timestamptz`

### `assigned_feeds`

- `id text primary key`
- `session_id text unique not null`
- `participant_name text`
- `study text`
- `condition text`
- `selected_categories jsonb`
- `recommendation_rule jsonb`
- `video_sequence jsonb`
- `preference_match_ratio numeric(6,4)`
- `created_at timestamptz`
- `updated_at timestamptz`

### `feed_summaries`

- `id text primary key`
- `session_id text unique not null`
- `participant_name text`
- `return_url text`
- `study text`
- `condition text`
- `exit_method text`
- `time_cap_choice text`
- `start_epoch_ms bigint`（进入视频信息流任务的 Unix 毫秒时间）
- `exit_epoch_ms bigint`（结束浏览任务并写入完成记录的 Unix 毫秒时间）
- `videos_viewed integer`
- `last_index integer`
- `total_feed_ms bigint`
- `total_dwell_ms bigint`
- `swipe_next_count integer`
- `swipe_prev_count integer`
- `speed_2x_count integer`
- `speed_2x_total_ms bigint`
- `action_tap_count integer`
- `like_count integer`
- `favorite_count integer`
- `follow_count integer`
- `sound_unmuted integer`
- `exit_prompt_count integer`
- `exit_cancel_count integer`
- `first_exit_attempt_ms bigint`
- `exit_decision_latency_ms bigint`
- `watch_ms_after_first_exit_attempt bigint`
- `dwell_ms_per_slide text`
- `event_count integer`
- `nominal_saturation_percent integer`（名义饱和度水平，含 100% 对照）
- `nominal_apply_at_sec integer`（设计上的呈现时间标签）
- `visual_treatment_applied integer`（是否真的发生过视觉切换，100% 对照为 0）
- `visual_applied_at_ms bigint`（实际发生视觉切换时的有效浏览时长）
- `exit_feedback_mode text`（`none` / `time` / `count` / `combined`）
- `continue_mode text`（`tap_cancel` / `swipe_to_continue` / `hold_to_continue`）
- `exit_mode text`（`tap_confirm` / `hold_to_exit`）
- `first_prompt_sec integer`（首次自动弹窗时间点）
- `final_duration_sec integer`（任务总时长上限）
- `blocked_exit_attempt_count integer`（解锁前被拦截的手动退出次数）
- `created_at timestamptz`
- `updated_at timestamptz`

其中，`total_feed_ms` 是有效刷视频累计时长（单位：毫秒），不包括“继续观看 / 退出”选择界面、去见数做题提示界面及返回等待时间；`start_epoch_ms` 与 `exit_epoch_ms` 是第一次开始浏览和最终结束任务的绝对时间点，二者差值可反映页面总体跨度，但不等同于有效刷视频时长；`total_dwell_ms` 是各视频停留时长之和。

### `feed_events`

- `id text primary key`
- `session_id text unique not null`
- `participant_name text`
- `return_url text`
- `study text`
- `condition text`
- `chunk_index integer`
- `events jsonb`
- `created_at timestamptz`
- `updated_at timestamptz`

### `completion_records`

- `id text primary key`
- `session_id text unique not null`
- `participant_name text`
- `study text`
- `condition text`
- `completed boolean`
- `completion_code text`
- `return_url text`
- `redirected_at bigint`
- `created_at timestamptz`
- `updated_at timestamptz`

### `audit_logs`

- `id text primary key`
- `session_id text`
- `study text`
- `condition text`
- `type text`
- `message text`
- `mode text`
- `source text`
- `payload jsonb`
- `created_at timestamptz`
- `updated_at timestamptz`

## 研究 3 追踪表

`cloudbase/migrations/20260910100000_create_tracking_tables.sql` 新增以下 4 张表，用于把同一被试的 10 天追踪记录与单次浏览 session 分开保存：

- `tracking_participants`：按姓名 + 自设追踪编号 + 条件建立追踪档案；正式分析应使用 `id` 作为被试标识。
- `tracking_runs`：每天 4 个目标时段（10:00、14:00、18:00、21:00）各一条任务记录，保存追踪日、目标日期、补做标记和单次任务完成码。
- `tracking_questionnaires`：第 1、5、10 天由见数外部量表回收后，管理员手动登记完成状态、量表版本和见数记录编号；不存逐题答案。
- `tracking_followups`：保存连续两日无数据或单日不足 4 次时生成的人工提醒文案、跟进状态和备注。

当天可补做未完成时段；`tracking_runs` 的 `(participant_id, target_date, session_slot)` 唯一约束防止同一时段重复计数。当前静态网页不承担被试离线后的自动消息推送。

## 索引建议

至少为这些常用查询字段建索引：

- `session_id`
- `study`
- `condition`
- `created_at`
- `updated_at`

`audit_logs` 额外建议给 `type` 建索引。

## 权限与 RLS

这套原型目前采用“宽松可写、便于验收”的策略：

- `anon` 和 `authenticated` 都允许 `SELECT / INSERT / UPDATE / DELETE`
- RLS 已启用，并对这 7 张业务表创建了允许全部操作的策略
- `service_role` 保持全权限

如果后续要收紧权限，建议把策略改成按 session ownership 或登录用户 ID 控制，但当前实验原型优先保证浏览器端能稳定落库。

### 关键点

- 浏览器端不要写 `current_user` 作为身份判断。
- 若后续改成按用户限制，使用 `auth.uid()`。
- `auth.uid()` 在 CloudBase PG 中返回 `text`，不是 `uuid`。

## 与前端字段的对应关系

### 常见映射

- `sessionId` ↔ `session_id`
- `participantName` ↔ `participant_name`
- `returnUrl` ↔ `return_url`
- `startedAt` ↔ `started_at`
- `preQuestionnaireSubmittedAt` ↔ `pre_questionnaire_submitted_at`
- `feedStartedAt` ↔ `feed_started_at`
- `completedAt` ↔ `completed_at`
- `selectedCategories` ↔ `selected_categories`
- `selectedCategoryLabels` ↔ `selected_category_labels`
- `preferenceMatchRatio` ↔ `preference_match_ratio`
- `videoSequence` ↔ `video_sequence`
- `events` ↔ `events`
- `completionCode` ↔ `completion_code`
- `redirectedAt` ↔ `redirected_at`

## CloudBase 控制台要做什么

1. 确认当前环境 `video-d3g9diest3dcce7b7` 已启用 PostgreSQL。
2. 打开 PG SQL / migration 界面，执行 migration 文件 `cloudbase/migrations/20260909120000_create_short_video_experiment_tables.sql`。
3. 检查表是否创建成功，特别是 `audit_logs`、`participant_sessions`、`feed_summaries`。
4. 用管理员后台的“写入测试记录”按钮验证：页面显示 `lastWriteSource: cloudbase`。
5. 再跑完整实验流程，确认数据能写入 PG 并能导出 CSV。

## 验证 SQL

迁移后可在控制台执行：

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'participant_sessions',
    'preference_responses',
    'assigned_feeds',
    'feed_summaries',
    'feed_events',
    'completion_records',
    'audit_logs'
  )
order by table_name;
```

以及：

```sql
select id, session_id, study, condition, created_at
from public.audit_logs
order by created_at desc
limit 5;
```

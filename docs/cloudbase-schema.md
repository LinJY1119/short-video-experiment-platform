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
- `created_at timestamptz`
- `updated_at timestamptz`

其中，`total_feed_ms` 是从 `start_epoch_ms` 到 `exit_epoch_ms` 的任务持续时长（单位：毫秒），包括退出提示或问卷提醒界面停留时间；`total_dwell_ms` 是各视频停留时长之和。

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

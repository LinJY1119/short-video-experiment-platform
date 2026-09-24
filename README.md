# 短视频退出界面实验平台原型

这是一个静态可运行的第一版原型，用于验证整体结构：

- 一个统一实验站承载 1A、1B、2A、2B、3 的 19 个实验条件。
- 被试进入后先选择 5 类短视频内容偏好中的 1–3 类。
- 系统按 70% 偏好类别 + 30% 非偏好类别生成推荐序列；同一轮素材耗尽前避免重复视频，某一类别耗尽后优先补其他未看过类别。研究 3 额外跨 session 记录已看过的素材，生成序列时优先未看过的视频。
- 刷视频界面复用 `credamo-jspsych-demo` 的抖音式手机壳 UI 与交互，但当前实现已改为纯前端 JavaScript，不再依赖短视频运行器或 Credamo。
- 素材改为动态加载：文件存放在 CloudBase 云存储，索引存放在 `video_assets` 表，新增素材通过网页上传，不需要改代码。详见「素材管理」。
- 数据层已经切换为 CloudBase PostgreSQL；浏览器端仍保留 `localStorage` 作为兜底，但正式实验数据应写入 PG。
- 研究 3 已提供 10 天追踪入口：每天 4 个时段可从同一入口恢复，量表由见数外部回收并由管理员登记状态；网站不承担离线自动推送。

## 本地运行

```bash
cd /Users/linjiayu/在线实验精英赛-2026/short-video-experiment-platform
npm run start
```

然后打开：

```text
http://localhost:5173/
```

## 关键入口

```text
/                         条件入口列表
/entry.html?study=1a&condition=g1
/entry.html?study=2a&condition=g7
/runner.html?sessionId=...  短视频运行器 刷视频运行页
/admin.html                管理员后台雏形
```

问卷平台可使用：

```text
https://experiment.yourdomain.com/entry.html?study=2a&condition=g7&name=张三&source=wjx&returnUrl=https%3A%2F%2Fquestionnaire.example%2Fnext
```

## 条件时程与共同基础对照

四个研究的浏览时程由 `src/config/conditions.js` 的 `browsing` 字段显式定义：

| 字段 | 含义 |
|---|---|
| `initialPromptSec` | 首次自动弹出退出界面的时间点；`null` 表示没有中途弹窗 |
| `finalDurationSec` | 任务总时长上限，到达后弹出最终退出界面 |
| `finalPromptForced` | 最终弹窗是否强制结束任务（两个按钮都会结束，仅记录选择） |
| `manualExitUnlockSec` | 在此之前点击左上角退出只记录尝试，不结束任务 |
| `questionnaireAfterFirstPrompt` | 首次弹窗选择继续后，是否先展示完成码与问卷提示 |

- 研究 1A、1B、2A：0–10 分钟浏览 → 10 分钟首次弹窗 → 选择继续后经问卷提示进入第二阶段 → 20 分钟最终弹窗强制结束。
- 研究 2B：单阶段；呈现时间（5／10／15 分钟）内强制观看，到点后降低饱和度并解锁手动退出，被试可随时退出且退出时点被记录；20 分钟最终弹窗强制结束。3×2 加一个饱和度不变的基线对照，共 7 组。
- 研究 3：单次 10 分钟追踪任务，达到 10 分钟后只能长按结束。

以下三组共用同一套两阶段基础流程，可复用同一对照编码：

| 条件 | 说明 |
|---|---|
| 1A-G1 | 无反馈、轻点继续、全程 100% 饱和度 |
| 1B-G1 | 无反馈、轻点继续、全程 100% 饱和度 |
| 2A-G1 | 无反馈、轻点继续、全程 100% 饱和度 |

2B-G6 是研究 2B 自己的基线对照（无反馈、轻点继续、全程 100% 饱和度），但走 2B 的单阶段流程：没有 10 分钟弹窗，到解锁时间后可自发退出，测的是自发退出率与退出时点，而非提示下的二择一选择。因此 **2B-G6 不能与上面三组合并**，只服务于 2B 内部比较。

即便是可合并的三组，也来自不同招募批次与不同后测组合。合并分析前需要在模型中保留研究编号与招募批次。

研究 2B 的编号沿用原方案：G1／G2 为 5 分钟，G4／G5 为 10 分钟，G7／G8 为 15 分钟（各含 30%、65% 两个饱和度水平），G6 为基线对照组；原 100% 饱和度的 G3、G9 已移除。

视觉处理字段中，`saturationPercent` 为名义饱和度水平，`applyAtSec` 为实际发生切换的时间；100% 水平的 `applyAtSec` 为 `null`，`nominalApplyAtSec` 仍保留设计上的时间标签。`feed_summaries` 同时记录 `nominal_saturation_percent`、`nominal_apply_at_sec`、`visual_treatment_applied` 与 `visual_applied_at_ms`，避免把 100% 对照误计为发生过视觉变化。

## 研究 3 追踪入口

- 研究 1A 对照组链接：`/entry.html?study=1a&condition=g1`（单次实验，不做10天追踪）
- 研究 3 实验组链接：`/entry.html?study=3&condition=g1`
- 研究 3 首次进入填写姓名、设置 4–20 位追踪编号并选择 1–3 类视频；后续每天仍从同一入口填写姓名和编号恢复记录。
- 每天目标时段为北京时间 10:00、14:00、18:00、21:00；当天可补做，系统保存每次任务的追踪日、时段和迟到标记。
- 第 1、5、10 天量表由见数外部问卷完成，管理员在后台手动登记状态和见数记录编号。
- 每次任务显示单次完成码；第 10 天全部任务与量表登记完成后生成最终追踪完成码。
- 研究 3 实验组配置为 10 分钟、65% 饱和度、观看时长与条数反馈、长按确认退出；达到 10 分钟后只能长按结束，不提供继续观看按钮。
- 素材取自 `tracking` 池。10 天 × 4 次共 40 个 session，每次任务结束后把实际看过的素材并入 `tracking_participants.seen_sample_ids`，下次生成序列时优先未看过的视频；池中未看过的素材耗尽后，按最久未见的顺序释放一半复用。
- 按每次约刷 30 条估算，要做到全程零重复需要约 1200 条素材。池子小于该规模时机制仍正常工作，只是后期开始复用。

正式使用前请先执行 `cloudbase/migrations/20260910100000_create_tracking_tables.sql`，并确认 CloudBase PostgreSQL 已创建追踪表。

条件与时程字段更新后，还需执行 `cloudbase/migrations/20260918120000_add_condition_manipulation_fields.sql`，为 `feed_summaries` 增加名义条件、实际视觉处理与时程记录列；未执行前浏览器端写入会回退到本地 `localStorage`。

## CloudBase 接入

当前前端已预留 CloudBase 浏览器直连能力：

- [src/config/cloudbase.js](src/config/cloudbase.js) 里填写 CloudBase `env` 与 `accessKey`。
- 页面通过 CloudBase Web SDK 直连 PostgreSQL，未配置时会自动回退到本地 `localStorage` 预览。
- 入口页、运行页和管理员页都已加载 CloudBase SDK，并沿用同一套 `window.ExperimentStore` 接口；管理员页可直接导出 CSV。

## PostgreSQL 版数据结构

业务数据只落这 7 张表：

- `participant_sessions`
- `preference_responses`
- `assigned_feeds`
- `feed_summaries`
- `feed_events`
- `completion_records`
- `audit_logs`

迁移文件在：

```text
cloudbase/migrations/20260909120000_create_short_video_experiment_tables.sql
cloudbase/migrations/20260909220000_add_feed_exit_epoch_ms.sql
```

如果 7 张表已经创建，只需再执行第二个增量迁移，为 `feed_summaries` 增加 `exit_epoch_ms` 字段；不需要删除已有数据或重建表。

## 平台分工

- EdgeOne Pages：存放网页入口、运行器与后台页面。
- COS：存放 `.mp4` 与 `.jpg` 素材文件。
- CloudBase PostgreSQL：存放 session、偏好选择、推荐序列、浏览摘要、行为日志与完成记录；数据库时间型字段写入 ISO 8601 字符串，实验测量字段保存 Unix 毫秒值。
- 本前端：负责条件解析、兴趣选择、推荐序列生成、短视频运行器浏览任务与回跳问卷平台。

## 视频地址

正式素材地址由 `video_assets.video_key` 拼接 CloudBase 公开读端点得到，不需要在代码中维护。详见下文「素材管理」。

静态兜底数组 `src/config/videos.js` 仍保留 100 条测试素材，仅在数据库不可用时启用。它在 localhost 下读取本地 `/stimuli/`，其他环境读取云存储；也可通过 URL 参数临时覆盖：

```text
?media=https://media.cloud-bridge.cn/stimuli/
```

这 100 条素材已剔除硬广（含购买链接、优惠券、直播带货）、不健康、露骨及擦边内容。需注意「潮流推荐」类按类别定义包含好物推荐与美妆产品测评，这类内容本身带有消费导向，但均为 UP 主自主分享、不含交易引导。

## CloudBase 运行说明

- 浏览器端使用 `window.ExperimentStore` 作为统一数据接口。
- CloudBase 相关参数放在 [src/config/cloudbase.js](src/config/cloudbase.js) 中。
- 入口页、运行页、管理员页均已加载 CloudBase SDK；若未配置参数，则自动回退到本地预览模式。
- 管理员页的“写入测试记录”按钮会向 `audit_logs` 写探针记录，用来确认 PostgreSQL 表、权限和写入链路是否正常。

## 主要文件

```text
index.html                    实验条件入口列表
entry.html                    被试进入页与兴趣选择
runner.html                   短视频运行器浏览任务容器
admin.html                    管理员后台（需 CloudBase 账号登录）
upload.html                   素材批量上传页，从后台进入
src/config/categories.js      5 类短视频分类
src/config/videos.js          静态兜底素材，仅在数据库不可用时启用
src/config/conditions.js      19 个实验条件配置
src/lib/assets.js             素材动态加载层，按池查询 video_assets
src/lib/admin-auth.js         后台与上传页共用的登录校验
src/lib/recommendation.js     推荐序列生成逻辑，支持「优先未看过」
src/lib/store.js              浏览器数据层，优先 CloudBase PostgreSQL，失败时回退 localStorage
src/upload/upload.js          批量上传：自动提取元数据、限流直传、写索引
src/runner/runner.js          复用并配置化的短视频运行器抖音式浏览任务
src/styles/runner.css         从原模板迁移的手机壳与信息流样式
src/styles/site.css           入口页与后台样式
scripts/backfill-video-assets.mjs  把静态素材回填进 video_assets
cloudbase/migrations/         PostgreSQL 迁移
```

## CloudBase 控制台要做什么

环境 `video-d3g9diest3dcce7b7` 已完成以下步骤（2026-09-24，通过 `tcb` CLI 执行）：

- [x] 执行全部迁移，包括此前从未执行过的 `20260910100000_create_tracking_tables.sql`（四张追踪表此前缺失，研究 3 数据只能落 localStorage）
- [x] 创建 `video_assets` / `video_upload_batches`，`assigned_feeds` 增加 `pool_tag` / `pool_version` / `pool_size`，`tracking_participants` 增加 `seen_sample_ids`
- [x] 配置素材表 RLS：`anon` 仅 SELECT 且限定已发布素材，写操作全部拒绝
- [x] 配置 `video-keeper` 存储桶策略：`authenticated` 可读写整桶（原策略只有 SELECT 且限定 `owner_id`，会导致上传失败）
- [x] 回收 `anon` 对全部被试数据表的 DELETE 权限
- [x] 回填原有 100 条素材，五类各 20，同时进入两个池
- [x] 创建上传人员账号 `uploader`

仍需手动完成：

- [ ] 用 `uploader` 账号登录 `admin.html`，确认能进入后台且素材列表显示 100 条
- [ ] 从后台进入上传页，传几个测试视频，确认存储与索引均写入成功

## 安全说明

`src/config/cloudbase.js` 里的 `accessKey` 是 publishable key，设计上对浏览器公开，本仓库也是公开仓库。因此应当假设**任何人都可能持有这个 key**，安全边界完全由数据库权限承担。

当前 `anon`（即被试身份）的能力范围：

| 资源 | 权限 |
|---|---|
| `video_assets` / `video_upload_batches` | 只能读已发布素材；增删改全部拒绝 |
| `video-keeper` 存储桶 | 无法上传或修改 |
| 被试数据表 | 可插入、可更新，**不能删除** |

### 尚未关闭的缺口

被试数据表对 `anon` 仍然可读。原因是 `store.js` 的 `upsert()` 会先按 id 查询再决定插入或更新，而研究 3 的被试需要靠姓名 + 追踪编号查回自己的追踪记录。要关闭它需要先把 `upsert()` 改写成 `INSERT ... ON CONFLICT` 去掉读依赖，再回收 SELECT 权限。

在此之前，建议：

- 被试姓名字段避免使用真实全名
- 正式招募前完成上述改造，或将仓库转为私有

### 验证命令

```bash
# 素材池状态
tcb db execute -e video-d3g9diest3dcce7b7 --sql \
  "SELECT primary_category, count(*) FILTER (WHERE status='active' AND enabled) AS live FROM public.video_assets GROUP BY 1 ORDER BY 1"

# 权限边界：以下两条都应报 permission denied
tcb db execute -e video-d3g9diest3dcce7b7 --role anon --sql \
  "INSERT INTO public.video_assets (id, sample_id, video_key, primary_category) VALUES ('probe','p','x.mp4','humor')"
tcb db execute -e video-d3g9diest3dcce7b7 --role anon --sql \
  "DELETE FROM public.participant_sessions WHERE id IS NOT NULL"
```

如果前端写入回退到本地，优先查看 `lastWriteError`，再排查表结构、权限或 SDK 初始化。


## 素材管理

素材已改为动态加载：视频文件存放在 CloudBase 云存储，索引与审核状态存放在 `video_assets` 表。新增素材不再需要修改代码或重新部署。

### 两个素材池

| 池 | 服务对象 | 说明 |
|---|---|---|
| `core` | 研究 1A/1B/2A/2B | 约五类各 20 条。被试间设计，替换素材时注意保持类别均衡 |
| `tracking` | 研究 3 | 累积增长。生成序列时优先未看过的视频，耗尽后按最久未见复用 |

同一条素材可同时属于两个池。原有 100 条通过 `scripts/backfill-video-assets.mjs` 回填后默认进入两个池。

### 日常流程

1. 本地按类别建好文件夹（`humor` / `life_record` / `trend_recommendation` / `talent_show` / `knowledge_news`），把视频分别放进去。
2. 登录 `admin.html`，点击「素材上传」进入 `upload.html`。
3. 选择目标池，选中父文件夹，点击「解析文件」。类别、时长、分辨率、封面、校验值均由浏览器自动提取。
4. 点击「开始上传」。文件先进云存储，成功后才写索引行；中断后重传同一文件夹会按校验值跳过已入库的文件。
5. 回到后台「素材池管理」，确认无误后点「启用」，素材才会进入实验。

上传后的素材默认为 `reviewing` 状态，被试查询不到。停用素材只改状态，云存储文件保留，历史 `assigned_feeds` 仍可复核。

每个 session 的 `assigned_feeds` 会记录 `pool_tag`、`pool_size` 与 `pool_version`。`pool_version` 是当时池内素材集合的指纹，两名被试取值相同当且仅当他们抽自完全相同的一批素材——这在替换过素材后判断可比性时有用。

### 存储桶结构

```text
video-keeper/stimuli/
├── video/ cover/                        原有 100 条，位置不变
├── core/<category>/video|cover/         研究 1/2 新增素材
└── tracking/<category>/video|cover/     研究 3 新增素材
```

目录结构仅便于人工排查；前端定位素材依靠 `video_assets.video_key` 中的完整路径，两种布局可以共存。

### 回填脚本

```bash
node scripts/backfill-video-assets.mjs            # 只看统计
node scripts/backfill-video-assets.mjs --sql      # 输出 SQL 供检查
tcb db execute -e video-d3g9diest3dcce7b7 --sql "$(node scripts/backfill-video-assets.mjs --sql)"
```

脚本只生成 INSERT 语句，不移动任何云存储文件，也不需要账号密码。使用 `ON CONFLICT DO NOTHING`，可重复执行。**该脚本已于 2026-09-24 执行完毕**，正常情况下不需要再跑。

### 降级行为

数据库不可用时，前端自动回退到 `src/config/videos.js` 中的静态数组，实验仍可开始。可在浏览器控制台通过 `window.VideoAssets.lastSource` 确认当前来源是 `cloudbase` 还是 `static`。

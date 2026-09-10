# 短视频退出界面实验平台原型

这是一个静态可运行的第一版原型，用于验证整体结构：

- 一个统一实验站承载 1A、1B、2A、2B 的 20 个实验条件。
- 被试进入后先选择 5 类短视频内容偏好中的 1–3 类。
- 系统按 70% 偏好类别 + 30% 非偏好类别生成推荐序列。
- 刷视频界面复用 `credamo-jspsych-demo` 的抖音式手机壳 UI 与交互，但当前实现已改为纯前端 JavaScript，不再依赖短视频运行器或 Credamo。
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

## 研究 3 追踪入口

- 对照组链接：`/entry.html?study=1a&condition=g1`
- 实验组链接：`/entry.html?study=3&condition=g1`
- 首次进入填写姓名、设置 4–20 位追踪编号并选择 1–3 类视频；后续每天仍从同一入口填写姓名和编号恢复记录。
- 每天目标时段为北京时间 10:00、14:00、18:00、21:00；当天可补做，系统保存每次任务的追踪日、时段和迟到标记。
- 第 1、5、10 天量表由见数外部问卷完成，管理员在后台手动登记状态和见数记录编号。
- 每次任务显示单次完成码；第 10 天全部任务与量表登记完成后生成最终追踪完成码。
- 研究 3 实验组配置为 10 分钟、65% 饱和度、观看时长与条数反馈、长按确认退出；达到 10 分钟后只能长按结束，不提供继续观看按钮。

正式使用前请先执行 `cloudbase/migrations/20260910100000_create_tracking_tables.sql`，并确认 CloudBase PostgreSQL 已创建追踪表。

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

## 视频地址替换

当前样例视频来自本地：

```text
/stimuli/video/*.mp4
/stimuli/cover/*.jpg
```

COS 上传完成后，修改：

```text
src/config/videos.js
```

中的：

```js
const remoteBase = 'https://media.cloud-bridge.cn/stimuli/'
```

并在非 localhost 环境自动使用远程素材地址。也可以临时通过 URL 参数覆盖：

```text
?media=https://media.cloud-bridge.cn/stimuli/
```

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
admin.html                    管理员后台雏形
src/config/categories.js      5 类短视频分类
src/config/videos.js          视频素材元数据
src/config/conditions.js      20 个实验条件配置
src/lib/recommendation.js     推荐序列生成逻辑
src/lib/store.js              浏览器数据层，优先 CloudBase PostgreSQL，失败时回退 localStorage
src/runner/runner.js          复用并配置化的短视频运行器抖音式浏览任务
src/styles/runner.css         从原模板迁移的手机壳与信息流样式
src/styles/site.css           入口页与后台样式
cloudbase/migrations/20260909120000_create_short_video_experiment_tables.sql  PostgreSQL 迁移
```

## CloudBase 控制台要做什么

1. 确认环境 `video-d3g9diest3dcce7b7` 已启用 PostgreSQL。
2. 执行 `cloudbase/migrations/20260909120000_create_short_video_experiment_tables.sql`。
3. 检查 `participant_sessions`、`feed_summaries`、`audit_logs` 是否创建成功。
4. 打开 `admin.html`，点击“写入测试记录”，确认页面显示 `lastWriteSource: cloudbase`。
5. 跑完整实验流程：入口页提交、运行页完成、导出 CSV。
6. 如果写入回退到本地，优先查看 `lastWriteError`，再排查表结构、权限或 SDK 初始化。

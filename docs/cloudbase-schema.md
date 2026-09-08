# CloudBase 接入与数据集合设计

当前前端通过 `src/lib/store.js` 统一访问数据；在 CloudBase 配置可用时，它会使用 Web SDK 直连数据库，并在失败时回退到浏览器 `localStorage` 预览。管理员页支持 CSV 导出，便于直接查看和手动处理记录。

## 建议集合

| 集合 | 作用 |
|---|---|
| `experiments` | 研究 1A、1B、2A、2B 的主表 |
| `experiment_conditions` | 20 个实验条件的配置 |
| `video_assets` | 视频素材元数据，视频文件本身仍在 EdgeOne |
| `participant_sessions` | 被试进入实验后生成的一次 session |
| `preference_responses` | 5 类短视频兴趣选择结果 |
| `assigned_feeds` | 每名被试实际分配到的视频序列 |
| `feed_summaries` | 浏览任务汇总指标 |
| `feed_events` | 逐条行为日志，建议按 session 分片 |
| `completion_records` | 完成码与问卷回跳记录 |
| `admin_users` | 管理员账号和角色 |
| `audit_logs` | 后台配置变更记录 |

## CloudBase Web SDK 接入位置

后续主要替换：

```text
src/lib/store.js
```

当前接口：

```js
window.ExperimentStore.readAll()
window.ExperimentStore.upsert(collectionName, record)
window.ExperimentStore.append(collectionName, record)
window.ExperimentStore.makeId(prefix)
window.ExperimentStore.exportJson()
window.ExperimentStore.clear()
```

CloudBase 接入后可保持同名接口，内部改为：

```js
const app = cloudbase.init({ env: '你的完整 EnvId', accessKey: 'publishable key' });
const auth = app.auth;
await auth.signInAnonymously();
const db = app.database();
```

注意：Web SDK 3.x 下，NoSQL 写入前需要已有可用 session。若使用匿名登录，需要先在 CloudBase 控制台启用匿名登录，并配置相应数据库权限。当前实现会在 CloudBase 初始化失败时回退到浏览器 `localStorage`。

## 数据权限建议

被试端：

- 允许创建自己的 `participant_sessions`、`preference_responses`、`assigned_feeds`、`feed_summaries`、`feed_events`、`completion_records`。
- 不允许读取其他被试数据。
- 不允许修改 `experiments`、`experiment_conditions`、`video_assets`。

管理员端：

- 登录后可读写 `experiments`、`experiment_conditions`、`video_assets`。
- 可读取和导出所有实验数据。
- 配置修改写入 `audit_logs`。

## 是否用 CloudBase 存视频

不建议把视频文件本身放 CloudBase。建议：

- EdgeOne：`.mp4` 与 `.jpg` 文件。
- CloudBase：视频 URL、分类、时长、分辨率、标签、启用状态等结构化元数据。

这样新增视频时，不需要改前端逻辑，只需要：

1. 上传视频和封面到 EdgeOne。
2. 在 `video_assets` 新增元数据。
3. 将该视频加入条件的视频池。

## 数据导出字段

正式数据至少应导出：

```text
participantName
sessionId
study
condition
selectedCategories
preferenceMatchRatio
videoSequence
completed
completionCode
videosViewed
totalFeedMs
totalDwellMs
swipeNextCount
swipePrevCount
exitPromptCount
exitCancelCount
firstExitAttemptMs
watchMsAfterFirstExitAttempt
createdAt
updatedAt
```

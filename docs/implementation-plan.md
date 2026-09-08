# 实验平台实施计划

## 1. 当前原型范围

当前版本是一个静态网页原型，目标是先固定实验流程和界面呈现：

1. 被试从条件 URL 进入。
2. 填写或确认被试姓名。
3. 从 5 类短视频内容中选择 1–3 类偏好。
4. 系统按 70% 偏好类别 + 30% 非偏好类别生成推荐序列。
5. 进入 短视频运行器 抖音式手机壳浏览任务。
6. 根据条件配置显示不同退出界面、继续方式和视觉处理。
7. 浏览摘要与行为日志先写入 `localStorage`。
8. 如 URL 中包含 `returnUrl`，完成后回跳问卷平台。

## 2. URL 设计

### 被试入口

```text
/entry.html?study=1a&condition=g1&name=张三&source=wjx&returnUrl=https%3A%2F%2Fquestionnaire.example%2Fnext
```

参数：

| 参数 | 含义 |
|---|---|
| `study` | `1a`、`1b`、`2a`、`2b` |
| `condition` | `g1` 等条件编号 |
| `name` | 问卷平台传入的被试姓名 |
| `source` | 来源平台，如 `wjx`、`credamo`、`local_preview` |
| `returnUrl` | 完成浏览任务后的回跳问卷地址 |
| `debug` | `1` 时在 runner 中显示调试面板 |

### 管理员后台

```text
/admin.html
```

当前为只读雏形，后续接 CloudBase 后可改为登录后访问。

## 3. 20 个实验条件

### 研究 1A

| 条件 | 说明 |
|---|---|
| 1A-G1 | 无反馈控制组 |
| 1A-G2 | 信息反馈组：显示已浏览条数与累计观看时长 |

### 研究 1B

| 条件 | 说明 |
|---|---|
| 1B-G1 | 正常色彩组 |
| 1B-G2 | 低饱和度组 |

### 研究 2A

| 条件 | 说明 |
|---|---|
| 2A-G1 | 无反馈控制组 |
| 2A-G2 | 时间反馈-点击继续 |
| 2A-G3 | 条数反馈-点击继续 |
| 2A-G4 | 组合反馈-点击继续 |
| 2A-G5 | 时间反馈-长按继续 |
| 2A-G6 | 条数反馈-长按继续 |
| 2A-G7 | 组合反馈-长按继续 |

### 研究 2B

| 条件 | 呈现时间 | 饱和度 |
|---|---:|---:|
| 2B-G1 | 5 分钟 | 30% |
| 2B-G2 | 5 分钟 | 65% |
| 2B-G3 | 5 分钟 | 100% |
| 2B-G4 | 10 分钟 | 30% |
| 2B-G5 | 10 分钟 | 65% |
| 2B-G6 | 10 分钟 | 100% |
| 2B-G7 | 15 分钟 | 30% |
| 2B-G8 | 15 分钟 | 65% |
| 2B-G9 | 15 分钟 | 100% |

实现文件：`src/config/conditions.js`。

## 4. 短视频分类

固定为 5 类：

| 编码 | 中文类别 |
|---|---|
| `humor` | 轻松搞笑类内容 |
| `life_record` | 生活记录视频内容 |
| `trend_recommendation` | 潮流推荐视频内容 |
| `talent_show` | 才艺展示视频内容 |
| `knowledge_news` | 知识资讯视频内容 |

实现文件：`src/config/categories.js`。

## 5. 短视频运行器复用方式

原 `credamo-jspsych-demo` 的复用原则：

- 保留手机壳、灵动岛、Home Indicator、安全区和信息流布局。
- 保留上滑/下滑切换、边缘长按 2 倍速、轻点声音、右侧互动栏和进度条。
- 将写死的 `STIMULI` 改为由入口页生成的推荐序列。
- 将固定退出弹窗改为由 `condition.exitNudge` 配置生成。
- 将 `feed--gray` 改为 CSS 变量控制饱和度，适配 30%、65%、100% 三种条件。
- 移除 Credamo / 见数专用 `onCredamoEndTrialFinish`，普通网页部署不需要该接口。

关键文件：

```text
runner.html
src/runner/runner.js
src/styles/runner.css
```

## 6. CloudBase 数据表设计

后续接 CloudBase 时，建议用以下集合：

```text
experiments
experiment_conditions
video_assets
participant_sessions
preference_responses
assigned_feeds
feed_summaries
feed_events
completion_records
admin_users
audit_logs
```

当前原型中，`src/lib/store.js` 用 `localStorage` 模拟这些集合。

### participant_sessions

```json
{
  "id": "sess_xxx",
  "participantName": "张三",
  "source": "wjx",
  "study": "2a",
  "condition": "g7",
  "entryUrl": "...",
  "returnUrl": "...",
  "status": "feed_completed",
  "startedAt": 1720000000000,
  "feedStartedAt": 1720000015000,
  "completedAt": 1720000615000,
  "selectedCategories": ["humor", "life_record"]
}
```

### preference_responses

```json
{
  "id": "pref_sess_xxx",
  "sessionId": "sess_xxx",
  "participantName": "张三",
  "study": "2a",
  "condition": "g7",
  "selectedCategories": ["humor", "life_record"],
  "submittedAt": 1720000015000
}
```

### assigned_feeds

```json
{
  "id": "feed_sess_xxx",
  "sessionId": "sess_xxx",
  "selectedCategories": ["humor", "life_record"],
  "recommendationRule": {
    "preferredRatio": 0.7,
    "selectionMode": "weighted_random"
  },
  "videoSequence": [
    {
      "videoId": "video_demo_humor_001",
      "primaryCategory": "humor",
      "matchedPreference": true
    }
  ],
  "preferenceMatchRatio": 0.7
}
```

### feed_summaries

```json
{
  "id": "summary_sess_xxx",
  "session_id": "sess_xxx",
  "participantName": "张三",
  "study": "2a",
  "condition": "g7",
  "exit_method": "confirm_exit_button",
  "videos_viewed": 18,
  "total_feed_ms": 603000,
  "total_dwell_ms": 598000,
  "exit_prompt_count": 2,
  "exit_cancel_count": 1
}
```

### feed_events

建议按 session 分片存，不建议每个事件一条记录：

```json
{
  "id": "events_sess_xxx_001",
  "sessionId": "sess_xxx",
  "chunkIndex": 1,
  "events": [
    {
      "type": "middle-swipe-next",
      "elapsed_ms": 12000,
      "target": "video_middle_zone",
      "duration": 320,
      "value": "DEMO_HUMOR_001"
    }
  ]
}
```

## 7. COS 素材目录

建议素材目录结构：

```text
stimuli/
├── video/
│   ├── xxx.mp4
│   └── ...
└── cover/
    ├── xxx.jpg
    └── ...
```

CloudBase 的 `video_assets` 只存 URL：

```text
https://media.cloud-bridge.cn/stimuli/video/xxx.mp4
https://media.cloud-bridge.cn/stimuli/cover/xxx.jpg
```

## 8. 后续开发顺序

1. 用当前原型确认 20 个条件的实验逻辑是否符合正式设计。
2. 补足真实视频素材，并为每条素材标注 5 类主分类。
3. 把 `src/config/videos.js` 的远程素材地址替换为 COS 域名 `media.cloud-bridge.cn`。
4. 接入 CloudBase，把 `src/lib/store.js` 替换为真实数据库写入.
5. 管理后台加入 CloudBase 登录和配置编辑。
6. 做数据导出：sessions、preference_responses、assigned_feeds、feed_summaries、feed_events。

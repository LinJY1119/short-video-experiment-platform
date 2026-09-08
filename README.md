# 短视频退出界面实验平台原型

这是一个静态可运行的第一版原型，用于验证整体结构：

- 一个统一实验站承载 1A、1B、2A、2B 的 20 个实验条件。
- 被试进入后先选择 5 类短视频内容偏好中的 1–3 类。
- 系统按 70% 偏好类别 + 30% 非偏好类别生成推荐序列。
- 刷视频界面复用 `credamo-jspsych-demo` 的抖音式手机壳 UI 与交互，但当前实现已改为纯前端 JavaScript，不再依赖 短视频运行器 或 Credamo。
- 当前先用浏览器 `localStorage` 模拟数据记录，后续可替换为 CloudBase 数据库。
- 当前不包含 Credamo / 见数专用接口，按普通网页部署处理。

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

## CloudBase 接入

当前前端已预留 CloudBase 浏览器直连能力：

- [src/config/cloudbase.js](src/config/cloudbase.js) 里填写 CloudBase `env` 与 `accessKey`。
- 页面通过 CloudBase Web SDK 直连数据库，未配置时会自动回退到本地 `localStorage` 预览。
- 入口页、运行页和管理员页都已加载 CloudBase SDK，并沿用同一套 `window.ExperimentStore` 接口；管理员页可直接导出 CSV。

## 平台分工

- EdgeOne Pages：存放网页入口、运行器与后台页面。
- COS：存放 `.mp4` 与 `.jpg` 素材文件。
- CloudBase：存放实验配置、session、偏好选择、推荐序列、浏览摘要、行为日志与完成记录。
- 本前端：负责条件解析、兴趣选择、推荐序列生成、短视频运行器 浏览任务与回跳问卷平台。

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
const remoteBase = 'https://media.cloud-bridge.cn/stimuli/';
```

并在非 localhost 环境自动使用远程素材地址。也可以临时通过 URL 参数覆盖：

```text
?media=https://media.cloud-bridge.cn/stimuli/
```

## CloudBase 运行说明

- 浏览器端使用 `window.ExperimentStore` 作为统一数据接口。
- CloudBase 相关参数放在 [src/config/cloudbase.js](src/config/cloudbase.js)。
- 入口页、运行页、管理员页均已加载 CloudBase SDK；若未配置参数，则自动回退到本地预览模式。
- 若要启用云端写入，需要在 CloudBase 控制台为当前环境开启匿名登录，并给 `participant_sessions`、`preference_responses`、`assigned_feeds`、`feed_summaries`、`feed_events`、`completion_records` 配好对应权限。

## 主要文件

```text
index.html                    实验条件入口列表
entry.html                    被试进入页与兴趣选择
runner.html                   短视频运行器 浏览任务容器
admin.html                    管理员后台雏形
src/config/categories.js      5 类短视频分类
src/config/videos.js          视频素材元数据
src/config/conditions.js      20 个实验条件配置
src/lib/recommendation.js     推荐序列生成逻辑
src/lib/store.js              浏览器数据层，优先 CloudBase，失败时回退 localStorage
src/runner/runner.js          复用并配置化的 短视频运行器 抖音式浏览任务
src/styles/runner.css         从原模板迁移的手机壳与信息流样式
src/styles/site.css           入口页与后台样式
```

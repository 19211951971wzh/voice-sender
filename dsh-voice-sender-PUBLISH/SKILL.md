---
name: dsh-voice-sender
description: 当用户要求把文字转成语音、生成/导出音频，或要求把语音消息发到 QQ、微信时使用；提供 voice_synthesize 与 send_voice 两个工具。
agent_created: true
---

# 语音合成与发送（dsh-voice-sender）

## 何时使用

- 用户说「生成语音」「念一段话」「转成音频」「试听」「导出 mp3」→ 用 `voice_synthesize`。
- 用户说「发语音到群里」「给某人发条语音」「用语音通知他/它」→ 用 `send_voice`。
- 用户只说「发送语音」但没指明平台和接收目标 → **先问清楚**，不要猜群号或联系人。

## 可用工具

### voice_synthesize
只合成，不发送。参数：`text`（必填）、`voice`、`rate`、`volume`、`pitch`、`fileName`。
返回本地 mp3 路径与文件大小。适合预览发音、生成素材。

### send_voice
合成并真实发送。必填：`text`、`platform`（`qq` / `wechat`）、`target`。
可选：`targetType`（`group` 默认 / `private`）、`voice`、`rate`、`volume`、`pitch`、`dryRun`。

## 调用纪律

1. **发送是外部动作**：调用 `send_voice` 前必须确认平台与目标，发错无法撤回。
2. **不确定就先试运行**：传 `dryRun: true` 只生成音频、不调用平台接口，把文件路径给用户确认后再正式发送。
3. **平台与目标只能来自用户**：不要从历史记录或猜测里填群号、微信 ID。
4. **长文本先拆**：默认上限 1000 字，超限时拆成多条分别发送，并告知用户顺序。
5. **失败如实回报**：适配器报错（HTTP 状态、OneBot retcode、桥接失败）要原样说明，不要假装已发送。

## 平台差异

- **QQ**：走 OneBot v11 HTTP，语音作为 `record` 消息段发送。目标是纯数字群号或 QQ 号。
- **微信**：没有官方机器人 API，插件把标准化负载 POST 到用户自建桥接，由桥接完成实际发送。目标是桥接约定的群/联系人 ID。
- 两个 profile（web / desktop）都可用；插件运行在 Host 侧，无需 UI 部分。

## 常见问题

- 报「未找到 edge-tts」：用户需先 `pip install edge-tts`，并确保命令在 PATH 中。
- 报「平台未被启用」：检查 profile 配置里的 `platforms` 是否包含目标平台。
- 报「OneBot 返回错误」：检查 `qqHttpUrl`、access token、以及 OneBot 实现是否启用了 HTTP 适配器。
- 微信侧未收到：检查桥接服务是否运行、`wechatBridgeUrl` 是否正确、token 是否匹配。

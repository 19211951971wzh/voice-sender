# dsh-voice-sender

DSH 语音发送插件：用 **Edge TTS**（免费、无需密钥）把文本合成 mp3，然后作为语音消息发到 **QQ（OneBot v11）** 或 **微信（自建桥接）**。

插件是 Host 侧工具插件，同一份包可安装到 `web` 和 `desktop` 两个 profile，不需要客户端 UI。

## Install

```bash
dsh plugin --profile web add github:wzh/dsh-voice-sender
dsh plugin --profile desktop add github:wzh/dsh-voice-sender
```

Restart DSH after installation. Requires Python 3 with `edge-tts` installed (`pip install edge-tts`). The QQ adapter needs a OneBot v11 implementation with an HTTP adapter; the WeChat adapter posts to a bridge you run yourself (no hook code is bundled).

Keywords: `dsh-plugin`, `voice`, `tts`, `edge-tts`, `onebot`, `qq`, `wechat`.

## 1. 能力边界

| 工具 | 作用 | 是否对外发送 |
|---|---|---|
| `voice_synthesize` | 文本 → 本地 mp3 文件 | 否 |
| `send_voice` | 文本 → mp3 → 语音消息 | 是（QQ / 微信） |

`send_voice` 支持 `dryRun: true`：只合成音频并返回路径，不调用任何平台接口。建议先用它确认内容。

## 2. 环境要求

- DSH `>=0.2.0`，Node.js `>=22.19.0` 或 `>=24`（DSH 自身要求）。
- Python 3 + `edge-tts`：`pip install edge-tts`，确保 `edge-tts` 命令在 PATH 中。
  - 可用 `config.ttsCommand` 换成自己的 TTS 封装脚本，但必须接受 `--voice <音色> --text <文本> --write-media <输出路径>`。
- QQ：一个开启了 **HTTP 适配器** 的 OneBot v11 实现（如 NapCat、Lagrange、go-cqhttp）。
- 微信：一个你自己运行、符合本文第 5 节契约的 HTTP 桥接服务。插件内**不含**任何微信 hook 代码。

## 3. 安装

### 桌面版、没有 `dsh` 命令行时（本机已用此方式装好）

无需命令行工具，直接改 profile 的两个文件：

1. 在 `~/.dsh/profiles/desktop/package.json` 的 `dsh.profile.bundles` 末尾加一行 `"dsh-voice-sender"`；同文件的 `dependencies` 里加 `"dsh-voice-sender": "link:<插件目录>"`。
2. 在 `~/.dsh/profiles/desktop/node_modules/` 下建一个指向插件目录的 junction：`New-Item -ItemType Junction -Path <...>\node_modules\dsh-voice-sender -Target <插件目录>`。
3. 重启 DSH 桌面版。

插件自带 `cordis.patch.yml`，所以不用改 profile 自己的 patch。若 \(\~/.dsh/profiles/desktop/package.json.bak-voice-\*\) 备份存在，可用于回滚。

### 有 `dsh` 命令行时（两个 profile）

开发期用 link 模式，改源码后只需重启 DSH：

```bash
dsh plugin --profile desktop add link:D:\path\to\dsh-voice-sender
dsh plugin --profile web add link:D:\path\to\dsh-voice-sender
```

正式安装（发布为 npm 包后）：

```bash
dsh plugin --profile desktop add dsh-voice-sender
dsh plugin --profile web add dsh-voice-sender
```

**安装后必须重启 DSH 进程**，仅刷新浏览器页面不会加载新插件。

确认已进配置树：

```bash
dsh --profile web --dump-config | grep voice-sender
dsh --profile desktop --dump-config | grep voice-sender
```

本机开发也可以直接用补丁启动（在插件目录执行）：

```bash
dsh web --patch ./cordis.yml
```

## 4. 配置项

在对应 profile 的 `cordis.patch.yml` 中覆盖 `voice-sender` 的 `config`：

| 字段 | 默认值 | 说明 |
|---|---|---|
| `ttsCommand` | `edge-tts` | TTS 可执行文件 |
| `ttsVoice` | `zh-CN-XiaoxiaoNeural` | 默认音色 |
| `ttsRate` / `ttsVolume` / `ttsPitch` | `+0%` / `+0%` / `+0Hz` | 语速、音量、音调 |
| `ttsTimeoutMs` | `30000` | 合成超时 |
| `outputDir` | 系统临时目录 | 音频输出目录，留空即用临时目录 |
| `keepAudio` | `true` | 发送后是否保留音频文件 |
| `maxTextLength` | `1000` | 单条文本长度上限 |
| `minIntervalMs` | `1000` | 两次真实发送的最小间隔，用于限频 |
| `platforms` | `qq,wechat` | 启用的平台，逗号分隔 |
| `qqHttpUrl` | `http://127.0.0.1:3000` | OneBot HTTP 根地址，不要带 `/send_*` |
| `qqAccessToken` | 空 | OneBot access token；建议改用环境变量 |
| `qqRecordMode` | `base64` | `base64` 或 `file`（后者发 `file://绝对路径`） |
| `wechatBridgeUrl` | `http://127.0.0.1:19090/send` | 微信桥接完整 URL |
| `wechatBridgeToken` | 空 | 桥接 Bearer token；建议改用环境变量 |

**凭据不要写进插件文件或提交到仓库。** 用环境变量：

```bash
export DSH_VOICE_QQ_TOKEN='你的 OneBot token'
export DSH_VOICE_WECHAT_TOKEN='你的桥接 token'
```

环境变量优先于配置文件；`cordis.patch.yml` 默认不含任何密钥字段。

## 5. QQ / 微信接入细节

### QQ（OneBot v11）

插件 POST `{qqHttpUrl}/send_group_msg` 或 `/send_private_msg`，消息段为：

```json
{
  "group_id": 123456,
  "message": [{ "type": "record", "data": { "file": "base64://..." } }]
}
```

要求 OneBot 实现开启 HTTP 适配器；`record` 段是否自动把 mp3 转成 QQ 可播放的 silk，取决于具体实现（NapCat / Lagrange 通常支持）。若你的实现只接受本地路径，把 `qqRecordMode` 设为 `file`，并确保 OneBot 进程能读到该路径。

手动验证端点：

```bash
curl -X POST http://127.0.0.1:3000/send_group_msg \
  -H 'Content-Type: application/json' \
  -d '{"group_id":123456,"message":[{"type":"text","data":{"text":"ping"}}]}'
```

### 微信桥接契约

微信没有官方机器人 API。插件把下面这个 JSON POST 到 `wechatBridgeUrl`，桥接负责真正发送：

```json
{
  "type": "voice",
  "requestId": "uuid",
  "target": { "kind": "group", "id": "目标群或联系人 ID" },
  "audio": {
    "path": "C:/.../voice-xxx.mp3",
    "base64": "SVZ...",
    "format": "mp3",
    "mime": "audio/mpeg",
    "bytes": 12345
  },
  "text": "原始文本，仅用于日志与参考"
}
```

桥接响应要求：

- 成功：HTTP 2xx，返回 `{ "ok": true, "messageId": "xxx" }`。
- 失败：非 2xx，或 2xx 但 `{ "ok": false, "error": "原因" }`。
- 若配置了 `wechatBridgeToken`，请求头会带 `Authorization: Bearer <token>`。

`examples/wechat-bridge.example.js` 是一个最小骨架，只有 TODO 占位、**不会真的发消息**，需你接入自己的发送实现（如 WeChatFerry 的 HTTP 服务）。

## 6. 在会话中使用

在 DSH 中先加载技能 `/dsh-voice-sender`，然后：

- 「把这段话合成语音，我听听效果」→ `voice_synthesize`
- 「把 '今晚 8 点开会' 发语音到 QQ 群 123456」→ `send_voice`，`platform=qq`, `target=123456`
- 「先别发，生成音频给我看看」→ `send_voice` + `dryRun: true`

## 7. 安全与风控

- **插件与 DSH 进程同权限**，能读写文件、发网络请求。安装前读源码，只从可信来源安装。
- `send_voice` 是真实对外动作，调用前务必确认平台和接收对象；误发无法撤回。
- 微信侧无官方 API，桥接通常依赖 PC 微信 hook，**风控较高**：建议用小号、控制频率、遵守平台规则，账号风险自行承担。
- QQ 侧已内置 `minIntervalMs` 默认 1000ms 的发送间隔，批量发送时不要调成 0。
- 不要把 token、账号密码写进插件目录或提交到公开仓库。

## 8. 故障排查

| 现象 | 排查 |
|---|---|
| 插件没出现 | `dsh --profile <p> --dump-config` 确认配置树；重启 DSH |
| 提示「未找到 edge-tts」 | `pip install edge-tts`，确认 PATH；Windows 可用 `where edge-tts` |
| 提示「平台未被启用」 | 检查 `platforms` 配置 |
| OneBot retcode 非 0 | 检查 HTTP 地址、token、HTTP 适配器是否开启 |
| 微信侧无回应 | 确认桥接服务在跑、`wechatBridgeUrl` 与 token 正确；看桥接日志 |
| 音频发送后 QQ 不播放 | 换 OneBot 实现或改用 `qqRecordMode: file`；确认 mp3→silk 转码支持 |

## 9. 版本

`0.1.0`。DSH 处于开发者预览期，插件接口可能随版本调整；升级 DSH 后如插件失效，先跑 `--dump-config` 并检查日志。

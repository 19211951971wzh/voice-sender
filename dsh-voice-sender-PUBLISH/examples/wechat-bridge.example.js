/**
 * 微信桥接骨架示例 —— 仅演示 dsh-voice-sender 的 HTTP 契约。
 *
 * 警告：此文件不会真正发送任何消息。你需要在下面的 TODO 处接入自己的
 * 微信发送实现（例如自建 WeChatFerry HTTP 服务），并自行承担账号风控风险。
 *
 * 启动： DSH_VOICE_WECHAT_TOKEN='你的token' node wechat-bridge.example.js
 */
import http from 'node:http'

const PORT = Number(process.env.BRIDGE_PORT || 19090)
const TOKEN = process.env.DSH_VOICE_WECHAT_TOKEN || ''

function reply(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

const server = http.createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/send') {
    return reply(res, 404, { ok: false, error: 'not found' })
  }

  if (TOKEN && req.headers.authorization !== `Bearer ${TOKEN}`) {
    return reply(res, 401, { ok: false, error: 'unauthorized' })
  }

  let raw = ''
  for await (const chunk of req) raw += chunk
  if (raw.length > 8 * 1024 * 1024) {
    return reply(res, 413, { ok: false, error: 'payload too large' })
  }

  let payload
  try {
    payload = JSON.parse(raw)
  } catch {
    return reply(res, 400, { ok: false, error: 'invalid JSON' })
  }

  if (payload?.type !== 'voice' || !payload?.target?.id || !payload?.audio?.base64) {
    return reply(res, 400, { ok: false, error: 'missing type/target/audio.base64' })
  }

  // ---------------------------------------------------------------------------
  // TODO: 在这里把语音发到微信。桥接需要自己完成：
  //   1. 把 payload.audio.base64 解码为 mp3（或使用 payload.audio.path）
  //   2. 按 payload.target.kind / payload.target.id 找到群或联系人
  //   3. 调用你选定的微信发送通道发送语音消息
  //   4. 把平台返回的 messageId 填进下面的 response
  //
  // 本示例故意不实现发送，只回一个占位 ID，方便你先联调 DSH 侧。
  // ---------------------------------------------------------------------------

  reply(res, 200, {
    ok: true,
    messageId: `placeholder-${payload.requestId || 'no-id'}`,
    note: '示例桥接：未真正发送。请替换 TODO 部分。',
  })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[wechat-bridge-example] listening on http://127.0.0.1:${PORT}/send`)
})

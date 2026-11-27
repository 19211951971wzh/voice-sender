import os from 'node:os'
import path from 'node:path'

const DEFAULTS = {
  ttsCommand: 'edge-tts',
  ttsVoice: 'zh-CN-XiaoxiaoNeural',
  ttsRate: '+0%',
  ttsVolume: '+0%',
  ttsPitch: '+0Hz',
  ttsTimeoutMs: 30000,
  outputDir: '',
  keepAudio: true,
  maxTextLength: 1000,
  minIntervalMs: 1000,
  platforms: 'qq,wechat',
  qqHttpUrl: 'http://127.0.0.1:3000',
  qqAccessToken: '',
  qqRecordMode: 'base64',
  wechatBridgeUrl: 'http://127.0.0.1:19090/send',
  wechatBridgeToken: '',
}

function positiveInt(value, fallback) {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : fallback
}

/** 把 patch / profile 传入的 config 归一化，密钥优先从环境变量读取。 */
export function normalizeConfig(raw = {}) {
  const merged = { ...DEFAULTS, ...(raw || {}) }

  // 凭据不写进插件文件与共享仓库：环境变量优先，profile 本地配置次之。
  if (!merged.qqAccessToken) merged.qqAccessToken = process.env.DSH_VOICE_QQ_TOKEN || ''
  if (!merged.wechatBridgeToken) merged.wechatBridgeToken = process.env.DSH_VOICE_WECHAT_TOKEN || ''

  merged.outputDir = merged.outputDir
    ? path.resolve(String(merged.outputDir))
    : path.join(os.tmpdir(), 'dsh-voice-sender')

  merged.platforms = [...new Set(String(merged.platforms || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean))]

  merged.ttsTimeoutMs = Math.max(1000, positiveInt(merged.ttsTimeoutMs, 30000))
  merged.maxTextLength = Math.max(1, positiveInt(merged.maxTextLength, 1000))
  merged.minIntervalMs = positiveInt(merged.minIntervalMs, 1000)
  merged.qqRecordMode = String(merged.qqRecordMode).toLowerCase() === 'file' ? 'file' : 'base64'
  merged.qqHttpUrl = String(merged.qqHttpUrl || '').replace(/\/+$/, '')
  merged.wechatBridgeUrl = String(merged.wechatBridgeUrl || '').trim()

  return merged
}

export { DEFAULTS }

import fs from 'node:fs/promises'
import { normalizeConfig } from './lib/config.js'
import { synthesize } from './lib/tts.js'
import { sendToQQ, sendToWechat } from './lib/adapters.js'
import { loadDefineTool } from './lib/hostdeps.mjs'

/** 插件标识：cordis.patch.yml 的 id 与之对应。只用具名导出，不要 export default。 */
export const name = 'dsh-voice-sender'
export const inject = ['tools']

const SYNTHESIS_OUTPUT = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean', required: true },
    filePath: { type: 'string', required: true },
    bytes: { type: 'integer' },
    voice: { type: 'string' },
  },
}

const SEND_OUTPUT = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean', required: true },
    platform: { type: 'string', required: true },
    target: { type: 'string', required: true },
    targetType: { type: 'string' },
    dryRun: { type: 'boolean' },
    filePath: { type: 'string', required: true },
    bytes: { type: 'integer' },
    voice: { type: 'string' },
    messageId: { type: 'string' },
    endpoint: { type: 'string' },
  },
}

export async function apply(ctx, rawConfig) {
  const defineTool = await loadDefineTool()
  const config = normalizeConfig(rawConfig)
  let lastSentAt = 0

  async function throttle() {
    const wait = config.minIntervalMs - (Date.now() - lastSentAt)
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
    lastSentAt = Date.now()
  }

  ctx.tools.register(defineTool({
    name: 'voice_synthesize',
    description: '把文本用 Edge TTS 合成为 mp3 语音文件，只生成本地文件，绝不发送到任何聊天平台。当用户要求“生成语音”“念一段话”“试听效果”“导出音频”但未要求发送时使用。',
    parameters: {
      text: { type: 'string', required: true, description: '要合成的文本，默认上限 1000 字' },
      voice: { type: 'string', description: '可选，覆盖默认音色，如 zh-CN-XiaoxiaoNeural、zh-CN-YunxiNeural' },
      rate: { type: 'string', description: '可选，语速，如 +10% 或 -10%' },
      volume: { type: 'string', description: '可选，音量，如 +0%' },
      pitch: { type: 'string', description: '可选，音调，如 +0Hz' },
      fileName: { type: 'string', description: '可选，输出文件名（不含路径），自动补 .mp3' },
    },
    output: {
      schema: SYNTHESIS_OUTPUT,
      render: (_args, value) => [{
        type: 'text',
        text: `语音已生成：${value.filePath}（${value.bytes ?? '?'} 字节，音色 ${value.voice || '默认'}）。未发送到任何平台。`,
      }],
    },
    async execute(args, exec) {
      const result = await synthesize({
        text: args.text,
        config,
        voice: args.voice,
        rate: args.rate,
        volume: args.volume,
        pitch: args.pitch,
        fileName: args.fileName,
        signal: exec?.signal,
      })
      return { ok: true, ...result }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'send_voice',
    description: '把文本合成为语音并作为语音消息真实发送到 QQ 或微信。仅当用户明确要求“发语音给某群/某人”时使用，调用前必须先确认平台（qq/wechat）和接收目标；这是对外可见的动作，误发无法撤回。可用 dryRun=true 先预览音频而不发送。',
    parameters: {
      text: { type: 'string', required: true, description: '要发送并合成的语音内容' },
      platform: { type: 'string', required: true, description: '发送平台：qq 或 wechat' },
      target: { type: 'string', required: true, description: '接收目标：QQ 群号/QQ 号，或微信桥接约定的群/联系人 ID' },
      targetType: { type: 'string', description: '可选，group（默认）或 private' },
      voice: { type: 'string', description: '可选，覆盖默认音色' },
      rate: { type: 'string', description: '可选，语速，如 +10%' },
      volume: { type: 'string', description: '可选，音量' },
      pitch: { type: 'string', description: '可选，音调' },
      dryRun: { type: 'boolean', description: '可选，true 时只合成并返回文件路径，不调用任何平台接口' },
    },
    output: {
      schema: SEND_OUTPUT,
      render: (_args, value) => [{
        type: 'text',
        text: value.dryRun
          ? `试运行：语音已合成到 ${value.filePath}，未发送。确认无误后再调用 send_voice 并去掉 dryRun。`
          : `语音已发送到 ${value.platform} / ${value.target}${value.messageId ? `（消息 ID ${value.messageId}）` : ''}。音频：${value.filePath}`,
      }],
    },
    async execute(args, exec) {
      const platform = String(args.platform || '').toLowerCase()
      if (!config.platforms.includes(platform)) {
        throw new Error(`平台 ${platform || '(空)'} 未被启用，当前允许：${config.platforms.join(', ') || '(无)'}`)
      }
      const targetType = args.targetType === 'private' ? 'private' : 'group'
      const target = String(args.target ?? '').trim()
      if (!target) throw new Error('接收目标 target 不能为空')

      const audio = await synthesize({
        text: args.text,
        config,
        voice: args.voice,
        rate: args.rate,
        volume: args.volume,
        pitch: args.pitch,
        signal: exec?.signal,
      })

      const base = {
        ok: true,
        platform,
        target,
        targetType,
        dryRun: Boolean(args.dryRun),
        filePath: audio.filePath,
        bytes: audio.bytes,
        voice: audio.voice,
      }

      if (args.dryRun) return base

      await throttle()
      let result
      if (platform === 'qq') {
        result = await sendToQQ({
          config,
          filePath: audio.filePath,
          target,
          targetType,
          signal: exec?.signal,
        })
      } else {
        result = await sendToWechat({
          config,
          filePath: audio.filePath,
          target,
          targetType,
          text: String(args.text ?? '').trim(),
          signal: exec?.signal,
        })
      }

      if (!config.keepAudio) {
        await fs.unlink(audio.filePath).catch(() => {})
      }

      return { ...base, ...result }
    },
  }))
}

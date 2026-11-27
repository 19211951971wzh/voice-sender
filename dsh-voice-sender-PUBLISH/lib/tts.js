import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

const execFileAsync = promisify(execFile)

function sanitizeFileName(name) {
  const cleaned = String(name).replace(/[^a-zA-Z0-9._\-\u4e00-\u9fa5]/g, '_').slice(0, 120)
  return cleaned || `voice-${Date.now()}-${randomUUID().slice(0, 8)}`
}

/**
 * 用 Python edge-tts CLI 合成 mp3。
 * 命令模板可通过 config.ttsCommand 整体替换（例如换成自己的 TTS 封装脚本）。
 * 约定参数：--voice <音色> --text <文本> --write-media <输出路径>
 */
export async function synthesize({
  text,
  config,
  voice,
  rate,
  volume,
  pitch,
  fileName,
  signal,
}) {
  const content = String(text ?? '').trim()
  if (!content) throw new Error('待合成的文本不能为空')
  if (content.length > config.maxTextLength) {
    throw new Error(`文本长度 ${content.length} 超过上限 ${config.maxTextLength}，请拆分后再合成`)
  }

  await fs.mkdir(config.outputDir, { recursive: true })

  let baseName = sanitizeFileName(fileName || `voice-${Date.now()}-${randomUUID().slice(0, 8)}`)
  if (!baseName.toLowerCase().endsWith('.mp3')) baseName += '.mp3'
  const filePath = path.join(config.outputDir, baseName)

  const useVoice = voice || config.ttsVoice
  // ttsCommand 可以是 "edge-tts"，也可以是带固定前缀的 "python -m edge_tts"。
  const parts = String(config.ttsCommand || 'edge-tts').trim().split(/\s+/)
  const [command, ...prefixArgs] = parts
  const args = [...prefixArgs, '--voice', useVoice, '--text', content, '--write-media', filePath]
  if (rate && rate !== '+0%') args.push('--rate', rate)
  if (volume && volume !== '+0%') args.push('--volume', volume)
  if (pitch && pitch !== '+0Hz') args.push('--pitch', pitch)

  try {
    await execFileAsync(command, args, {
      timeout: config.ttsTimeoutMs,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
      signal,
    })
  } catch (err) {
    const hint = err?.code === 'ENOENT'
      ? '未找到 edge-tts 可执行文件，请先执行 pip install edge-tts 并确保它在 PATH 中。'
      : `底层命令失败：${err?.message || String(err)}`
    throw new Error(`Edge TTS 合成失败：${hint}`)
  }

  const stat = await fs.stat(filePath)
  if (stat.size === 0) throw new Error('TTS 生成了空文件，请检查音色名与文本')

  return { filePath, bytes: stat.size, voice: useVoice }
}

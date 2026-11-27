import fs from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'

const MAX_VOICE_BYTES = 5 * 1024 * 1024
const HTTP_TIMEOUT_MS = 15000

function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function postJson(url, body, token, signal) {
  if (!url) throw new Error('未配置发送端点 URL')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS)
  const abort = () => controller.abort()
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', abort, { once: true })
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const raw = await res.text()
    let data
    try {
      data = JSON.parse(raw)
    } catch {
      data = { raw: raw.slice(0, 500) }
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}：${JSON.stringify(data).slice(0, 500)}`)
    }
    return data
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error('发送请求超时或被取消')
    throw err
  } finally {
    clearTimeout(timer)
    if (signal) signal.removeEventListener('abort', abort)
  }
}

/** QQ：OneBot v11 HTTP API，用 record 消息段发送语音。 */
export async function sendToQQ({ config, filePath, target, targetType, signal }) {
  if (!/^\d+$/.test(String(target))) {
    throw new Error('QQ 目标必须是纯数字的群号或 QQ 号')
  }
  const isPrivate = targetType === 'private'
  const endpoint = isPrivate ? '/send_private_msg' : '/send_group_msg'
  const url = `${config.qqHttpUrl}${endpoint}`

  let fileValue
  if (config.qqRecordMode === 'file') {
    const stat = await fs.stat(filePath)
    if (stat.size > MAX_VOICE_BYTES) {
      throw new Error('语音文件超过 5MB，OneBot 实现通常会拒绝，请缩短文本')
    }
    fileValue = pathToFileURL(filePath).href
  } else {
    const buf = await fs.readFile(filePath)
    if (buf.length > MAX_VOICE_BYTES) {
      throw new Error('语音文件超过 5MB，OneBot 实现通常会拒绝，请缩短文本')
    }
    fileValue = `base64://${buf.toString('base64')}`
  }

  const message = [{ type: 'record', data: { file: fileValue } }]
  const body = isPrivate
    ? { user_id: Number(target), message }
    : { group_id: Number(target), message }

  const data = await postJson(url, body, config.qqAccessToken, signal)
  if (data?.retcode !== undefined && Number(data.retcode) !== 0) {
    throw new Error(`OneBot 返回错误 retcode=${data.retcode}：${data.message || data.wording || ''}`)
  }
  if (data?.status && data.status !== 'ok') {
    throw new Error(`OneBot 返回状态异常：${JSON.stringify(data).slice(0, 300)}`)
  }

  return {
    messageId: data?.data?.message_id ?? null,
    endpoint: url,
  }
}

/**
 * 微信：没有官方机器人 API，这里走用户自建桥接。
 * 插件只负责 POST 标准化负载，具体发送由桥接实现，插件内不含任何 hook 代码。
 */
export async function sendToWechat({ config, filePath, target, targetType, text, signal }) {
  const buf = await fs.readFile(filePath)
  if (buf.length > MAX_VOICE_BYTES) {
    throw new Error('语音文件超过 5MB，请先缩短文本')
  }

  const body = {
    type: 'voice',
    requestId: randomUUID(),
    target: {
      kind: targetType === 'private' ? 'private' : 'group',
      id: String(target),
    },
    audio: {
      path: filePath,
      base64: buf.toString('base64'),
      format: 'mp3',
      mime: 'audio/mpeg',
      bytes: buf.length,
    },
    text,
  }

  const data = await postJson(config.wechatBridgeUrl, body, config.wechatBridgeToken, signal)
  if (data?.ok === false) {
    throw new Error(`微信桥接返回失败：${data.error || data.message || '未知错误'}`)
  }

  return {
    messageId: data?.messageId ?? data?.id ?? null,
    endpoint: config.wechatBridgeUrl,
  }
}

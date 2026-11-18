// Vercel 上的聊天接口：和本地开发用的是同一套逻辑（server/chat.ts）。
// 密钥等配置来自 Vercel 项目的环境变量，不会进入网页代码。
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createChatHandler } from '../server/chat.js'

function parseExtra(raw: string | undefined): Record<string, unknown> | undefined {
  if (!raw) return undefined
  try {
    const v: unknown = JSON.parse(raw)
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
  } catch {
    // 配置写错时忽略，不让整个接口挂掉
  }
  return undefined
}

const handler = createChatHandler({
  apiKey: process.env.LLM_API_KEY || undefined,
  baseUrl: process.env.LLM_BASE_URL || 'https://api.deepseek.com',
  model: process.env.LLM_MODEL || 'deepseek-flash',
  extraBody: parseExtra(process.env.LLM_EXTRA_BODY),
  accessCode: process.env.ACCESS_CODE || undefined,
})

export default function chat(req: IncomingMessage, res: ServerResponse) {
  return handler(req, res)
}

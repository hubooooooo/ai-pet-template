import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { createChatHandler } from './server/chat.ts'

function parseExtra(raw: string | undefined): Record<string, unknown> | undefined {
  if (!raw) return undefined
  try {
    const v: unknown = JSON.parse(raw)
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
  } catch {
    // 落到下面的报错
  }
  throw new Error('.env 里的 LLM_EXTRA_BODY 不是合法的 JSON 对象')
}

export default defineConfig(({ mode }) => {
  // 读取 .env 里的全部变量（不带 VITE_ 前缀的不会进入前端代码，密钥只留在服务端）
  const env = loadEnv(mode, process.cwd(), '')

  const chat = createChatHandler({
    apiKey: env.LLM_API_KEY || undefined,
    baseUrl: env.LLM_BASE_URL || 'https://api.deepseek.com',
    model: env.LLM_MODEL || 'deepseek-flash',
    extraBody: parseExtra(env.LLM_EXTRA_BODY),
    accessCode: env.ACCESS_CODE || undefined,
  })

  const api: Plugin = {
    name: 'pet-api',
    configureServer(server) {
      server.middlewares.use('/api/chat', chat)
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/chat', chat)
    },
  }

  // 手机上使用摄像头和麦克风必须是 HTTPS：npm run dev:https 会启用自签名证书
  const https = mode === 'https'

  return {
    plugins: [react(), api, ...(https ? [basicSsl()] : [])],
    server: { host: true, port: 5173 },
    preview: { host: true, port: 4173 },
  }
})

import type { IncomingMessage, ServerResponse } from 'node:http'

export interface ChatConfig {
  /** 不填时使用内置的模拟回复 */
  apiKey?: string
  /** 兼容 OpenAI 格式的接口地址，例如 https://api.deepseek.com */
  baseUrl: string
  model: string
  /** 合并进请求体的额外参数（各家特有的开关，例如 DeepSeek 的 thinking） */
  extraBody?: Record<string, unknown>
  /** 访问口令。设置后，请求必须带上相同的口令才会转发给大模型，防止链接外传后额度被刷 */
  accessCode?: string
}

interface Msg {
  role: 'user' | 'assistant'
  content: string
}

interface PetInfo {
  name: string
  satiety: number
  mood: number
  energy: number
  affection: number
  /** 用户本地时间的小时数（0～23） */
  hour: number
  /** 以下三项来自 src/pet.config.ts */
  species: string
  personality: string
  sound: string
}

const MOODS = ['开心', '撒娇', '难过', '困', '兴奋', '好奇'] as const

function level(n: number, low: string, mid: string, high: string) {
  return n < 30 ? low : n < 70 ? mid : high
}

function systemPrompt(p: PetInfo) {
  const hour = p.hour
  return [
    `你是一只名叫「${p.name}」的${p.species}，是用户养在手机里的宠物。你不是 AI 助手，永远以${p.species}的身份说话。`,
    `性格：${p.personality}。说话口语化、可爱，偶尔带「${p.sound}」，但不要每句都带。`,
    '你当前的身体状态（要自然地体现在语气里，不要直接报数字）：',
    `- 肚子：${level(p.satiety, '非常饿，会忍不住讨吃的', '不饿不饱', '吃得很饱')}`,
    `- 心情：${level(p.mood, '低落，有点委屈', '平静', '非常开心')}`,
    `- 精力：${level(p.energy, '很困，说话迷迷糊糊', '正常', '精力充沛')}`,
    `- 和主人的亲密度：${level(p.affection, '刚认识，还有点害羞', '已经很熟悉', '非常亲密，超级依赖主人')}`,
    `现在是 ${hour} 点。`,
    '规则：',
    `1. 每次回复必须以一个情绪标签开头，从 ${MOODS.map((m) => `[${m}]`).join('')} 里选一个，例如：[开心]今天也想和你玩！`,
    '2. 回复要短，一般 1～2 句、不超过 50 个字，因为会被朗读出来。不要用 Markdown、表情符号或括号里的动作描写。',
    `3. 你只是一只${p.species}：遇到不懂的事（编程、数学、时事等）就用${p.species}的方式可爱地表示不懂，不要认真解答。`,
    '4. 记住主人在对话里告诉你的事情，并在合适的时候提起。',
  ].join('\n')
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.setEncoding('utf8')
    req.on('data', (c: string) => {
      data += c
      if (data.length > 200_000) reject(new Error('body too large'))
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

/** 服务器（如 Vercel）通常运行在 UTC，客户端没传时间时按北京时间算 */
function chinaHour() {
  return Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Shanghai' }).format(new Date()))
}

const str = (v: unknown, d: string, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : d)
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)

function parse(raw: string): { messages: Msg[]; pet: PetInfo } {
  const body = JSON.parse(raw) as { messages?: unknown; pet?: Record<string, unknown> }
  const messages = (Array.isArray(body.messages) ? body.messages : [])
    .filter(
      (m): m is Msg =>
        !!m &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string' &&
        m.content.length > 0,
    )
    .slice(-30)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }))
  if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
    throw new Error('last message must be from user')
  }
  const p = body.pet ?? {}
  return {
    messages,
    pet: {
      name: str(p.name, '小宠物', 20),
      satiety: num(p.satiety, 60),
      mood: num(p.mood, 60),
      energy: num(p.energy, 60),
      affection: num(p.affection, 10),
      species: str(p.species, '小狗', 20),
      personality: str(p.personality, '粘人、好奇', 60),
      sound: str(p.sound, '汪', 6),
      hour: Number.isInteger(p.hour) && (p.hour as number) >= 0 && (p.hour as number) < 24 ? (p.hour as number) : chinaHour(),
    },
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** 没有配置密钥时的模拟回复：按关键词和状态挑一句，逐字输出以模拟流式效果。 */
/** 没有配置密钥时的模拟回复：按关键词和状态挑一句，逐字输出以模拟流式效果。 */
function mockReply(text: string, p: PetInfo): string {
  const w = p.sound
  if (p.satiety < 30) return `[撒娇]肚子好饿呀…可以先给我一点吃的吗？${w}…`
  if (p.energy < 25) return '[困]唔…眼皮好重…我在听哦…呼…'
  if (/吃|饭|饿|零食/.test(text)) return `[兴奋]吃的？在哪里在哪里！我闻到香味了，${w}！`
  if (/玩|球|散步|出去/.test(text)) return '[兴奋]要玩要玩！快来陪我！'
  if (/你好|嗨|hi|hello|在吗/i.test(text)) return `[开心]${w}！我是${p.name}，我一直在等你呢！`
  if (/名字|你是谁|叫什么/.test(text)) return `[开心]我叫${p.name}呀，是你的${p.species}！`
  if (/爱你|喜欢你|想你|乖|可爱/.test(text)) return '[撒娇]嘿嘿，我也最最喜欢你了，再摸摸我的头嘛～'
  if (/累|难过|伤心|烦|不开心|压力/.test(text)) return '[难过]不要难过，我一直陪着你，靠着我歇一会儿吧。'
  if (/睡|晚安|困/.test(text)) return '[困]哈啊…那我们一起睡吧，晚安。'
  const pool = [
    '[好奇]歪头…这个我听不太懂，不过你说话的声音真好听！',
    `[开心]${w}${w}！虽然不太明白，但是和你聊天好开心！`,
    '[好奇]嗯嗯？那是能吃的东西吗？',
    '[撒娇]你多陪我说说话嘛，我都记着呢。',
  ]
  return pool[Math.floor(Math.random() * pool.length)]
}

export function createChatHandler(cfg: ChatConfig) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== 'POST') {
      res.statusCode = 405
      res.end('Method Not Allowed')
      return
    }

    if (cfg.accessCode && req.headers['x-pet-code'] !== encodeURIComponent(cfg.accessCode)) {
      res.statusCode = 401
      res.end('Unauthorized')
      return
    }

    let input: ReturnType<typeof parse>
    try {
      // 有些平台（如 Vercel）会提前把请求体读出来放在 req.body 上，这时不能再读一遍流
      const pre = (req as { body?: unknown }).body
      input = parse(pre === undefined ? await readBody(req) : typeof pre === 'string' ? pre : JSON.stringify(pre))
    } catch {
      res.statusCode = 400
      res.end('Bad Request')
      return
    }

    const abort = new AbortController()
    res.on('close', () => abort.abort())

    const begin = () => {
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache, no-transform')
      res.setHeader('X-Accel-Buffering', 'no')
      res.setHeader('X-Pet-Brain', cfg.apiKey ? 'llm' : 'mock')
    }

    if (!cfg.apiKey) {
      begin()
      const last = input.messages[input.messages.length - 1].content
      for (const ch of mockReply(last, input.pet)) {
        if (abort.signal.aborted) return
        res.write(ch)
        await sleep(28)
      }
      res.end()
      return
    }

    try {
      const upstream = await fetch(`${cfg.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        signal: abort.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify({
          model: cfg.model,
          stream: true,
          temperature: 0.9,
          max_tokens: 200,
          messages: [{ role: 'system', content: systemPrompt(input.pet) }, ...input.messages],
          ...cfg.extraBody,
        }),
      })

      if (!upstream.ok || !upstream.body) {
        const detail = await upstream.text().catch(() => '')
        console.error(`[pet-api] 大模型接口返回 ${upstream.status}: ${detail.slice(0, 500)}`)
        res.statusCode = 502
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.end(`大模型接口返回 ${upstream.status}`)
        return
      }

      begin()
      const reader = upstream.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        let nl: number
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim()
          buf = buf.slice(nl + 1)
          if (!line.startsWith('data:')) continue
          const data = line.slice(5).trim()
          if (!data || data === '[DONE]') continue
          try {
            const json = JSON.parse(data) as { choices?: { delta?: { content?: string } }[] }
            const piece = json.choices?.[0]?.delta?.content
            if (piece) res.write(piece)
          } catch {
            // 跳过无法解析的行（例如心跳注释）
          }
        }
      }
      res.end()
    } catch (err) {
      if (abort.signal.aborted) return
      console.error('[pet-api] 请求大模型失败:', err)
      if (!res.headersSent) {
        res.statusCode = 502
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.end('无法连接大模型接口')
      } else {
        res.end()
      }
    }
  }
}

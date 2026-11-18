import { useCallback, useEffect, useRef, useState } from 'react'
import type { PetState } from '../state/usePet'
import { PET } from '../pet.config'

export interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
}

export type Mood = '开心' | '撒娇' | '难过' | '困' | '兴奋' | '好奇'
const MOODS: Mood[] = ['开心', '撒娇', '难过', '困', '兴奋', '好奇']

const KEY = 'ai-pet/chat/v1'
const CODE_KEY = 'ai-pet/access-code'
const KEEP = 40

function load(): ChatMsg[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return (JSON.parse(raw) as ChatMsg[]).slice(-KEEP)
  } catch {
    // 聊天记录损坏时从空白开始
  }
  return []
}

/**
 * 模型的回复以 [情绪] 开头。流式输出时标签可能还没到齐，
 * 这里返回「已经可以展示的正文」和「解析到的情绪」。
 */
export function splitMood(raw: string): { mood: Mood | null; text: string } {
  const s = raw.trimStart()
  const m = /^[[【]\s*([^\]】]{1,4})\s*[\]】]\s*/.exec(s)
  if (m) {
    const mood = MOODS.find((x) => x === m[1]) ?? null
    return { mood, text: s.slice(m[0].length) }
  }
  // 标签只收到一半：先不显示
  if (/^[[【][^\]】]{0,5}$/.test(s)) return { mood: null, text: '' }
  return { mood: null, text: s }
}

class AccessError extends Error {}

interface SendHooks {
  onMood?: (mood: Mood) => void
  onDone?: (text: string) => void
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMsg[]>(load)
  const [streaming, setStreaming] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const messagesRef = useRef(messages)
  messagesRef.current = messages

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(messages.slice(-KEEP)))
    } catch {
      // 忽略
    }
  }, [messages])

  const send = useCallback(async (text: string, pet: PetState, hooks: SendHooks = {}) => {
    const content = text.trim()
    if (!content) return
    const history: ChatMsg[] = [...messagesRef.current, { role: 'user', content }]
    setMessages(history)
    setBusy(true)
    setStreaming('')

    let reply = ''
    try {
      const payload = JSON.stringify({
          messages: history.slice(-20),
          pet: {
            name: pet.name,
            satiety: pet.satiety,
            mood: pet.mood,
            energy: pet.energy,
            affection: pet.affection,
            hour: new Date().getHours(),
            species: PET.species,
            personality: PET.personality,
            sound: PET.sound,
          },
      })
      const post = () =>
        fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // 请求头里不能直接放中文，编码后再发
            'X-Pet-Code': encodeURIComponent(localStorage.getItem(CODE_KEY) ?? ''),
          },
          body: payload,
        })
      let res = await post()
      if (res.status === 401) {
        // 服务端设了访问口令：问一次，记在本机，之后不再问
        const code = window.prompt('请输入访问口令')?.trim()
        if (!code) throw new AccessError('没有口令我不能陪你聊天哦，下次记得告诉我～')
        localStorage.setItem(CODE_KEY, code)
        res = await post()
        if (res.status === 401) {
          localStorage.removeItem(CODE_KEY)
          throw new AccessError('口令好像不对呀，再试一次吧～')
        }
      }
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let raw = ''
      let moodSent = false
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        raw += decoder.decode(value, { stream: true })
        const { mood, text: shown } = splitMood(raw)
        if (mood && !moodSent) {
          moodSent = true
          hooks.onMood?.(mood)
        }
        reply = shown
        setStreaming(shown)
      }
      // 把解码器里可能剩下的半个字符也取出来
      raw += decoder.decode()
      reply = splitMood(raw).text.trim()
      if (!reply) throw new Error('empty reply')
      setMessages((m) => [...m, { role: 'assistant', content: reply }])
    } catch (err) {
      console.error('聊天请求失败', err)
      reply = err instanceof AccessError ? err.message : '呜…我的脑袋突然转不动了，等一下再跟我说好不好？'
    } finally {
      setStreaming(null)
      setBusy(false)
    }
    hooks.onDone?.(reply)
  }, [])

  const clear = useCallback(() => setMessages([]), [])

  return { messages, streaming, busy, send, clear }
}

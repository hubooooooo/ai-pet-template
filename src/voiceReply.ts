// 语音互动：不做语音识别，只用麦克风的音量判断"你在说话"和"你说完了"，
// 说完后播放几声狗叫作为回应。全部在本机完成，不需要联网，任何手机浏览器都能用。
// 默认叫声素材的来源见 public/sounds/CREDITS.md。

export interface VoiceReplyHandlers {
  /** 听到你开始说话 */
  onHearStart: () => void
  /** 你说完了，马上要叫；count 是叫几声，ms 是叫声总时长 */
  onBark: (count: number, ms: number) => void
  /** 叫完了，重新开始听 */
  onBarkEnd: () => void
}

export interface VoiceReplySession {
  stop: () => void
}

import { PET } from './pet.config'

// 叫声素材的文件名和音调在 src/pet.config.ts 里设置
const BASE = `${import.meta.env.BASE_URL}sounds/`

let ctx: AudioContext | null = null
let buffers: AudioBuffer[] | null = null

async function ensureAudio() {
  // 必须在用户点击之后创建或恢复，否则 iOS 不让出声
  if (!ctx) ctx = new (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
  if (ctx.state === 'suspended') await ctx.resume()
  if (!buffers) {
    const c = ctx
    buffers = await Promise.all(
      PET.sounds.map(async (f) => {
        const data = await (await fetch(`${BASE}${f}`)).arrayBuffer()
        // 用回调写法：旧版 Safari 的 decodeAudioData 不返回 Promise
        return new Promise<AudioBuffer>((resolve, reject) => c.decodeAudioData(data, resolve, reject))
      }),
    )
  }
  return { ctx, buffers }
}

/** 叫 count 声，返回总时长（毫秒）。每声随机挑一个素材并略微变调，听起来不会一模一样。 */
export async function playBarks(count: number): Promise<number> {
  const a = await ensureAudio()
  let t = a.ctx.currentTime + 0.05
  const start = t
  for (let i = 0; i < count; i++) {
    const buf = a.buffers[Math.floor(Math.random() * a.buffers.length)]
    const src = a.ctx.createBufferSource()
    src.buffer = buf
    // 每声的音调略有不同，听起来不会一模一样
    src.playbackRate.value = PET.soundPitch * (1 + Math.random() * 0.2)
    const gain = a.ctx.createGain()
    gain.gain.value = 0.75 + Math.random() * 0.25
    src.connect(gain).connect(a.ctx.destination)
    src.start(t)
    t += buf.duration / src.playbackRate.value * 0.62 + 0.06 + Math.random() * 0.08
  }
  return (t - start) * 1000 + 150
}

const canSpeakNow = () => 'speechSynthesis' in window

export function voiceReplySupported() {
  return window.isSecureContext && !!navigator.mediaDevices?.getUserMedia
}

export async function startVoiceReply(h: VoiceReplyHandlers): Promise<VoiceReplySession> {
  const a = await ensureAudio()
  const stream = await navigator.mediaDevices.getUserMedia({
    video: false,
    // 回声消除很重要：否则它会听到自己的叫声，以为是你在说话
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  })
  const source = a.ctx.createMediaStreamSource(stream)
  const analyser = a.ctx.createAnalyser()
  analyser.fftSize = 1024
  source.connect(analyser)
  const data = new Float32Array(analyser.fftSize)

  let stopped = false
  let floor = 0.01 // 环境底噪，慢慢跟随
  let loudSince = 0
  let quietSince = 0
  let speaking = false
  let speakStart = 0
  let mutedUntil = 0 // 自己叫的时候不听

  const timer = window.setInterval(() => {
    if (stopped) return
    const now = performance.now()
    analyser.getFloatTimeDomainData(data)
    let sum = 0
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i]
    const rms = Math.sqrt(sum / data.length)
    // 自己在叫、或正在朗读 AI 的回复时不听，否则会把自己的声音当成你在说话
    if (now < mutedUntil || (canSpeakNow() && speechSynthesis.speaking)) {
      speaking = false
      loudSince = quietSince = 0
      return
    }

    const loud = rms > Math.max(0.018, floor * 3.2)
    if (!loud) floor += (rms - floor) * 0.05

    if (loud) {
      quietSince = 0
      if (!loudSince) loudSince = now
      if (!speaking && now - loudSince > 140) {
        speaking = true
        speakStart = loudSince
        h.onHearStart()
      }
    } else {
      loudSince = 0
      if (speaking) {
        if (!quietSince) quietSince = now
        // 停顿超过 0.8 秒算说完
        if (now - quietSince > 800) {
          speaking = false
          const talked = quietSince - speakStart
          quietSince = 0
          // 说得越久，回应的叫声越多
          const count = talked < 1200 ? 1 : talked < 3200 ? 2 : 3
          mutedUntil = now + 5000 // 先占住，等知道实际时长再改
          void playBarks(count).then((ms) => {
            if (stopped) return
            mutedUntil = performance.now() + ms + 350
            h.onBark(count, ms)
            window.setTimeout(() => !stopped && h.onBarkEnd(), ms)
          })
        }
      }
    }
  }, 50)

  return {
    stop: () => {
      stopped = true
      clearInterval(timer)
      source.disconnect()
      stream.getTracks().forEach((t) => t.stop())
    },
  }
}

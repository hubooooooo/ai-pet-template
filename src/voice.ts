// 朗读：用浏览器自带的语音合成把宠物的回复读出来，不依赖任何云服务。

export const canSpeak = () => 'speechSynthesis' in window

let voice: SpeechSynthesisVoice | null = null
function pickVoice() {
  const voices = speechSynthesis.getVoices()
  voice =
    voices.find((v) => v.lang === 'zh-CN' && /Tingting|婷婷|Xiaoxiao|晓晓|Meijia/i.test(v.name)) ??
    voices.find((v) => v.lang === 'zh-CN') ??
    voices.find((v) => v.lang.startsWith('zh')) ??
    null
}
if (canSpeak()) {
  pickVoice()
  speechSynthesis.addEventListener?.('voiceschanged', pickVoice)
}

/**
 * iOS 只允许在用户手势里启动朗读。在点击「发送」时先播一句空白，
 * 之后回复到达时的朗读才不会被拦截。
 */
export function unlockSpeech() {
  if (!canSpeak()) return
  const u = new SpeechSynthesisUtterance(' ')
  u.volume = 0
  speechSynthesis.speak(u)
}

export function speak(text: string, onEnd?: () => void) {
  if (!canSpeak() || !text) {
    onEnd?.()
    return
  }
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'zh-CN'
  if (voice) u.voice = voice
  u.pitch = 1.5
  u.rate = 1.05
  u.onend = () => onEnd?.()
  u.onerror = () => onEnd?.()
  speechSynthesis.speak(u)
}

export function stopSpeaking() {
  if (canSpeak()) speechSynthesis.cancel()
}

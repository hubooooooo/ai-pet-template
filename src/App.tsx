import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { VideoPet } from './pet/VideoPet'
import { probeClips, type Anim, type ClipSet } from './pet/clips'
import { PET, fill, line } from './pet.config'
import { usePet } from './state/usePet'
import { useChat, type Mood } from './chat/useChat'
import { Icon, type IconName } from './ui/icons'
import { DEBUG } from './pet/debug'
import { cameraSupported, startCamera, type CamEvent, type CameraSession } from './camera'
import { canSpeak, speak, stopSpeaking, unlockSpeech } from './voice'
import { voiceReplySupported, startVoiceReply, type VoiceReplySession } from './voiceReply'

const VOICE_KEY = 'ai-pet/voice-on'

/** 部分浏览器的隐私模式下读写本地存储会直接抛错 */
function readVoicePref() {
  try {
    return localStorage.getItem(VOICE_KEY) !== '0'
  } catch {
    return true
  }
}

function Ring({ icon, label, value }: { icon: IconName; label: string; value: number }) {
  const v = Math.round(value)
  const c = 2 * Math.PI * 17
  return (
    <div className={`ring ${v < 25 ? 'low' : ''}`} role="meter" aria-label={label} aria-valuenow={v}>
      <div className="ring-dial">
        <svg viewBox="0 0 40 40">
          <circle className="ring-track" cx="20" cy="20" r="17" />
          <circle
            className="ring-value"
            cx="20"
            cy="20"
            r="17"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - v / 100)}
          />
        </svg>
        <Icon name={icon} size={17} />
      </div>
      <span>{label}</span>
    </div>
  )
}

export function App() {
  const { pet, awayMs, feed, play, stroke, toggleSleep, wake, bond, rename } = usePet()
  const chat = useChat()

  const [action, setAction] = useState<Anim | null>(null)
  const [actionKey, setActionKey] = useState(0)
  // undefined = 还在检查；null = 还没有放视频
  const [clipSet, setClipSet] = useState<ClipSet | null | undefined>(undefined)
  const [caption, setCaption] = useState('')
  const [input, setInput] = useState('')
  // listening = 语音互动开着（麦克风在听）；hearing = 此刻正听到你在说话
  const [listening, setListening] = useState(false)
  const [hearing, setHearing] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [voiceOn, setVoiceOn] = useState(() => readVoicePref())
  const [hearts, setHearts] = useState<{ id: number; x: number }[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [toast, setToast] = useState('')
  // off = 关闭；loading = 正在请求权限和加载识别模型；on = 正在看
  const [cam, setCam] = useState<'off' | 'loading' | 'on'>('off')
  const camSession = useRef<CameraSession | null>(null)
  const camPreview = useRef<HTMLVideoElement>(null)
  const camHandler = useRef<(e: CamEvent) => void>(() => {})
  /** 每次开关摄像头加一；加载过程中被关掉时，用它作废这次启动 */
  const camRun = useRef(0)
  const micStarting = useRef(false)

  const actionTimer = useRef(0)
  const lineTimer = useRef(0)
  const toastTimer = useRef(0)
  const voiceSession = useRef<VoiceReplySession | null>(null)
  const heartId = useRef(0)
  const petRef = useRef(pet)
  petRef.current = pet

  const act = useCallback((anim: Anim, ms: number) => {
    setAction(anim)
    setActionKey((k) => k + 1)
    clearTimeout(actionTimer.current)
    actionTimer.current = window.setTimeout(() => setAction(null), ms)
  }, [])

  const say = useCallback((text: string, ms = 5000) => {
    setCaption(text)
    clearTimeout(lineTimer.current)
    lineTimer.current = window.setTimeout(() => setCaption(''), ms)
  }, [])

  const notify = useCallback((text: string) => {
    setToast(text)
    clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 3500)
  }, [])

  useEffect(() => {
    let alive = true
    void probeClips().then((set) => alive && setClipSet(set))
    return () => {
      alive = false
    }
  }, [])

  // 打开页面时，按离开的时长打个招呼
  useEffect(() => {
    if (petRef.current.sleeping) return
    const name = petRef.current.name
    if (awayMs < 0) say(line('firstMeet', name), 8000)
    else if (awayMs > 6 * 3600_000) say(line('backAfterLong', name), 7000)
    else if (awayMs > 30 * 60_000) say(line('backAfterShort', name), 6000)
  }, [awayMs, say])

  useEffect(() => {
    try {
      localStorage.setItem(VOICE_KEY, voiceOn ? '1' : '0')
    } catch {
      // 忽略
    }
    if (!voiceOn) {
      stopSpeaking()
      setSpeaking(false)
    }
  }, [voiceOn])

  const onPet = useCallback(() => {
    if (petRef.current.sleeping) {
      say(line('pettedWhileAsleep'), 2500)
      return
    }
    stroke()
    act('pet', 900)
    const id = ++heartId.current
    setHearts((h) => [...h.slice(-8), { id, x: 35 + Math.random() * 30 }])
    window.setTimeout(() => setHearts((h) => h.filter((x) => x.id !== id)), 1100)
    if (id % 6 === 1) say(line('petted'), 2500)
  }, [act, say, stroke])

  const onPoke = useCallback(() => {
    if (petRef.current.sleeping) {
      wake()
      say(line('pokedWhileAsleep'))
      return
    }
    act('poke', 900)
    say(line('poked'), 2000)
  }, [act, say, wake])

  const onBoop = useCallback(() => {
    if (petRef.current.sleeping) {
      wake()
      say(line('noseWhileAsleep'))
      return
    }
    act('boop', 1100)
    say(line('nose'), 2600)
  }, [act, say, wake])

  const onFeed = () => {
    const r = feed()
    say(r.line)
    if (r.ok) act('eat', 2300)
  }
  const onPlay = () => {
    const r = play()
    say(r.line)
    if (r.ok) act('play', 3000)
  }
  const onSleep = () => say(toggleSleep().line, 3500)

  const send = useCallback(
    (raw: string) => {
      const text = raw.trim()
      if (!text || chat.busy) return
      setInput('')
      setCaption('')
      if (voiceOn) unlockSpeech()
      if (petRef.current.sleeping) wake()
      bond(1)
      void chat.send(text, petRef.current, {
        onMood: (mood: Mood) => {
          if (mood === '兴奋' || mood === '撒娇' || mood === '开心') act('pet', 1100)
        },
        onDone: (reply) => {
          say(reply, 9000)
          if (voiceOn && canSpeak()) {
            setSpeaking(true)
            speak(reply, () => setSpeaking(false))
          }
        },
      })
    },
    [act, bond, chat, say, voiceOn, wake],
  )

  // 摄像头看到的事 → 宠物的反应。睡着、正在说话或正在听的时候不打扰。
  camHandler.current = (e: CamEvent) => {
    const p = petRef.current
    if (p.sleeping || chat.busy || hearing || speaking) return
    switch (e) {
      case 'appear':
        act('talk', 1800)
        say(line('camAppear', p.name), 3500)
        break
      case 'smile':
        bond(1)
        act('pet', 2600)
        say(line('camSmile', p.name), 3500)
        break
      case 'wave':
        act('talk', 2000)
        say(line('camWave', p.name), 3500)
        break
      case 'near':
        act('boop', 1900)
        say(line('camNear', p.name), 3500)
        break
      case 'leave':
        act('sad', 4000)
        say(line('camLeave', p.name), 4000)
        break
      case 'gone':
        if (p.energy <= 90) say(toggleSleep().line, 3500)
        break
    }
  }

  const onCamera = async () => {
    const run = ++camRun.current
    if (cam !== 'off') {
      camSession.current?.stop()
      camSession.current = null
      setCam('off')
      return
    }
    if (!cameraSupported()) {
      notify(window.isSecureContext ? '这个浏览器不支持使用摄像头' : '摄像头需要 HTTPS，请用 npm run dev:https 启动后再试')
      return
    }
    setCam('loading')
    try {
      const session = await startCamera(
        (e) => camHandler.current(e),
        DEBUG
          ? (text) => {
              const el = document.getElementById('perf')
              if (el) el.textContent = `摄像头：${text}`
            }
          : undefined,
      )
      // 加载期间用户又点了关闭：直接关掉，不要再打开
      if (run !== camRun.current) return session.stop()
      camSession.current = session
      setCam('on')
    } catch (err) {
      if (run !== camRun.current) return
      console.error('摄像头启动失败', err)
      setCam('off')
      const name = err instanceof DOMException ? err.name : ''
      notify(
        name === 'NotAllowedError'
          ? '没有摄像头权限，请在浏览器设置里允许使用摄像头'
          : name === 'NotFoundError'
            ? '找不到摄像头'
            : '摄像头互动启动失败，请稍后再试',
      )
    }
  }

  // 预览小窗接上摄像头画面；离开页面时关掉摄像头
  useEffect(() => {
    const el = camPreview.current
    if (cam === 'on' && el && camSession.current) {
      el.srcObject = camSession.current.stream
      void el.play().catch(() => {})
    }
  }, [cam])
  useEffect(
    () => () => {
      camRun.current++
      camSession.current?.stop()
    },
    [],
  )

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    send(input)
  }

  // 声音互动：你说话，它用叫声回应。只判断"有没有在说话"，不识别内容。
  const onMic = async () => {
    // 正在请求麦克风权限时再点不重复启动，否则会同时开两个麦克风会话
    if (micStarting.current) return
    if (listening) {
      voiceSession.current?.stop()
      voiceSession.current = null
      setListening(false)
      setHearing(false)
      setSpeaking(false)
      return
    }
    if (!voiceReplySupported()) {
      notify(window.isSecureContext ? '这个浏览器不支持使用麦克风' : '麦克风需要 HTTPS，请用 npm run dev:https 启动后再试')
      return
    }
    stopSpeaking()
    micStarting.current = true
    try {
      voiceSession.current = await startVoiceReply({
        onHearStart: () => {
          if (petRef.current.sleeping) wake()
          setHearing(true)
        },
        onBark: (count) => {
          setHearing(false)
          setSpeaking(true)
          bond(0.5)
          const replies = PET.lines.soundReply
          say(fill(replies[Math.min(count, replies.length) - 1], petRef.current.name), 2200)
        },
        onBarkEnd: () => setSpeaking(false),
      })
      setListening(true)
      say(line('micOn'), 2500)
    } catch (err) {
      console.error('语音互动启动失败', err)
      const name = err instanceof DOMException ? err.name : ''
      notify(
        name === 'NotAllowedError'
          ? '没有麦克风权限，请在浏览器设置里允许使用麦克风'
          : name === 'NotFoundError'
            ? '找不到麦克风'
            : '语音互动启动失败，请稍后再试',
      )
    } finally {
      micStarting.current = false
    }
  }
  useEffect(() => () => voiceSession.current?.stop(), [])

  const onRename = () => {
    const name = window.prompt('给它起个名字', pet.name)?.trim()
    if (name) rename(name.slice(0, 12))
  }

  const needsCare = pet.satiety < 25 || pet.mood < 25
  const anim: Anim =
    action ??
    (hearing
      ? 'listen'
      : chat.streaming !== null || speaking
        ? 'talk'
        : pet.sleeping
          ? 'sleep'
          : needsCare
            ? 'sad'
            : 'idle')

  const waiting = chat.streaming === ''
  const bubble = chat.streaming !== null ? chat.streaming : caption

  return (
    <div className="app">
      <header className="top">
        <div className="title-row">
          <button className="name" onClick={onRename} aria-label="修改名字">
            <span className="name-text">{pet.name}</span>
            <span className="name-sub">
              {PET.speciesShort} · {pet.sleeping ? '睡着了' : needsCare ? '需要照顾' : '状态不错'}
              <Icon name="edit" size={12} />
            </span>
          </button>
          <div className="top-actions">
            <button
              className={`round ${voiceOn ? 'on' : ''}`}
              onClick={() => setVoiceOn((v) => !v)}
              aria-pressed={voiceOn}
              aria-label={voiceOn ? '关闭朗读' : '开启朗读'}
            >
              <Icon name={voiceOn ? 'sound' : 'mute'} size={19} />
            </button>
            <button
              className={`round ${cam !== 'off' ? 'on' : ''} ${cam === 'loading' ? 'busy' : ''}`}
              onClick={onCamera}
              aria-pressed={cam !== 'off'}
              aria-label={cam === 'off' ? '开启摄像头互动' : '关闭摄像头互动'}
            >
              <Icon name="camera" size={19} />
            </button>
            <button className="round" onClick={() => setHistoryOpen(true)} aria-label="聊天记录">
              <Icon name="chat" size={19} />
            </button>
          </div>
        </div>
        <div className="rings">
          <Ring icon="bowl" label="饱食" value={pet.satiety} />
          <Ring icon="smile" label="心情" value={pet.mood} />
          <Ring icon="bolt" label="精力" value={pet.energy} />
          <Ring icon="heart" label="亲密" value={pet.affection} />
        </div>
      </header>

      <main className="stage">
        {clipSet ? (
          <VideoPet set={clipSet} anim={anim} actionKey={actionKey} onPet={onPet} onPoke={onPoke} onBoop={onBoop} />
        ) : clipSet === null ? (
          <div className="no-video">
            <strong>还没有宠物视频</strong>
            <p>
              按教程生成宠物的视频，放进项目的 <code>public/clips</code> 文件夹，刷新页面就能看到它了。
              在此之前，打字聊天已经可以用。
            </p>
          </div>
        ) : null}
        {(bubble || waiting) && (
          <div className="bubble" role="status">
            {waiting ? (
              <span className="dots" aria-label="正在想">
                <i />
                <i />
                <i />
              </span>
            ) : (
              bubble
            )}
          </div>
        )}
        {pet.sleeping && !action && <div className="zzz">z z z</div>}
        {hearts.map((h) => (
          <span key={h.id} className="heart" style={{ left: `${h.x}%` }}>
            <Icon name="heart" size={26} />
          </span>
        ))}
        {cam === 'on' && <video ref={camPreview} className="cam-preview" muted playsInline />}
        {cam === 'loading' && <div className="cam-loading">正在打开摄像头…</div>}
        {toast && <div className="toast">{toast}</div>}
        {DEBUG && (
          <div id="perf" className="perf">
            {clipSet ? '调试模式 · 蓝圈是触摸分区' : '调试模式'}
          </div>
        )}
      </main>

      <footer className="bottom">
        <div className="actions">
          <button onClick={onFeed}>
            <span className="act-icon">
              <Icon name="bowl" />
            </span>
            喂食
          </button>
          <button onClick={onPlay}>
            <span className="act-icon">
              <Icon name="ball" />
            </span>
            玩耍
          </button>
          <button onClick={onSleep}>
            <span className="act-icon">
              <Icon name={pet.sleeping ? 'sun' : 'moon'} />
            </span>
            {pet.sleeping ? '叫醒' : '睡觉'}
          </button>
        </div>
        <form className="chat" onSubmit={onSubmit}>
          <button
            type="button"
            className={`mic ${listening ? 'live' : ''}`}
            onClick={onMic}
            aria-label={listening ? '关闭语音互动' : '开启语音互动'}
          >
            <Icon name={listening ? 'stop' : 'mic'} size={20} />
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={hearing ? '正在听你说…' : listening ? '对它说话，它会回应你' : `和${pet.name}说点什么`}
            maxLength={200}
            enterKeyHint="send"
            autoComplete="off"
          />
          <button type="submit" className="send" disabled={!input.trim() || chat.busy} aria-label="发送">
            <Icon name="send" size={20} />
          </button>
        </form>
      </footer>

      {historyOpen && (
        <div className="sheet-mask" onClick={() => setHistoryOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-grip" />
            <div className="sheet-head">
              <strong>聊天记录</strong>
              <div className="sheet-tools">
                {chat.messages.length > 0 && (
                  <button
                    className="text-btn"
                    onClick={() => {
                      if (window.confirm(`清空后${pet.name}会忘记你们聊过的内容，确定吗？`)) chat.clear()
                    }}
                  >
                    清空
                  </button>
                )}
                <button className="round small" onClick={() => setHistoryOpen(false)} aria-label="关闭">
                  <Icon name="close" size={16} />
                </button>
              </div>
            </div>
            <div className="sheet-body">
              {chat.messages.length === 0 && <p className="empty">还没有聊过天，去和它说句话吧。</p>}
              {chat.messages.map((m, i) => (
                <div key={i} className={`msg ${m.role}`}>
                  {m.content}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

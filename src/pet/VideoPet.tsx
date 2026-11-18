import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import { clipUrl, resolveLoop, ZONE_ORDER, type Anim, type ClipName, type ClipSet, type ZoneName } from './clips'
import { DEBUG } from './debug'

interface Props {
  set: ClipSet
  anim: Anim
  /** 每触发一次动作加一，同一个动作连续触发时也能重新播放 */
  actionKey: number
  onPet: () => void
  onPoke: () => void
  onBoop: () => void
}

/** 片段之间交叉淡入淡出的时长（毫秒）。循环片段回到开头时也用它，所以首尾不必严丝合缝。 */
const FADE = 320

const ANIM_CLIP: Record<Anim, ClipName> = {
  idle: 'idle',
  talk: 'talk',
  listen: 'listen',
  sleep: 'sleep',
  sad: 'sad',
  pet: 'pet',
  boop: 'boop',
  poke: 'poke',
  eat: 'eat',
  play: 'play',
}

/**
 * 用预先生成的视频片段来表现宠物。
 * 两个叠在一起的 <video> 轮流播放：要切换时，把新片段装进后面那个，淡入盖住前一个。
 */
export function VideoPet({ set, anim, actionKey, onPet, onPoke, onBoop }: Props) {
  const frame = useRef<HTMLDivElement>(null)
  const vids = [useRef<HTMLVideoElement>(null), useRef<HTMLVideoElement>(null)]
  const [dims, setDims] = useState<[number, number] | null>(null)
  const st = useRef({
    active: 0,
    clip: null as ClipName | null,
    /** 正在播一次性的动作片段 */
    oneShot: false,
    /** 动作播完后要回到的状态片段 */
    base: 'idle' as ClipName,
    /** 每次切换加一，用来作废上一次切换里还没触发的回调 */
    token: 0,
    ending: false,
    blobs: new Map<ClipName, string>(),
    lastStroke: 0,
  })

  const show = useCallback(
    (name: ClipName, restart = false) => {
      const s = st.current
      const next = vids[1 - s.active].current
      const prev = vids[s.active].current
      if (!next || !prev) return
      const token = ++s.token
      const def = set.clips[name]
      const url = s.blobs.get(name) ?? clipUrl(name)
      s.clip = name
      s.oneShot = !def.loop
      s.ending = false

      const start = () => {
        if (token !== s.token) return
        void next.play().catch(() => {})
        next.style.zIndex = '2'
        prev.style.zIndex = '1'
        next.style.opacity = '1'
        s.active = 1 - s.active
        window.setTimeout(() => {
          // 淡入完成后再把旧的藏起来并暂停；期间旧画面垫在下面，不会露出背景
          if (token !== s.token) return
          prev.style.opacity = '0'
          prev.pause()
        }, FADE + 40)
      }
      const seekThenStart = () => {
        if (token !== s.token) return
        // 循环回到开头时用 loopStart，跳过只需要播一次的"进入"过程
        const at = (restart ? def.loopStart : undefined) ?? def.start ?? 0
        if (Math.abs(next.currentTime - at) < 0.03 && next.readyState >= 2) return start()
        next.addEventListener('seeked', start, { once: true })
        next.currentTime = at
      }
      next.style.opacity = '0'
      if (next.dataset.url !== url) {
        next.dataset.url = url
        next.addEventListener('loadeddata', seekThenStart, { once: true })
        next.src = url
        next.load()
      } else seekThenStart()
    },
    // vids 是固定的两个 ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [set],
  )

  /** 当前片段播到头了：循环片段从头再来，动作片段回到状态片段 */
  const finish = useCallback(() => {
    const s = st.current
    if (s.ending || !s.clip) return
    s.ending = true
    if (s.clip === 'sleepIn') return show(resolveLoop(set, 'sleep'))
    if (s.oneShot) show(s.base)
    else show(s.clip, true)
  }, [set, show])

  // 开场：直接播待机片段
  useEffect(() => {
    const first = vids[0].current
    if (!first) return
    const s = st.current
    s.clip = 'idle'
    first.dataset.url = clipUrl('idle')
    first.src = clipUrl('idle')
    first.style.opacity = '1'
    void first.play().catch(() => {})

    // 快到结尾时提前开始交叉淡入，这样接缝处不会卡一下
    const timer = window.setInterval(() => {
      const el = vids[s.active].current
      if (!el || !s.clip || s.ending || el.paused) return
      const end = set.clips[s.clip].end ?? el.duration
      if (Number.isFinite(end) && el.currentTime >= end - FADE / 1000 - 0.06) finish()
    }, 50)

    // 后台把其余片段整段下载好，之后切换就是瞬时的
    let cancelled = false
    void (async () => {
      for (const name of set.available) {
        if (cancelled) return
        try {
          const blob = await (await fetch(clipUrl(name))).blob()
          if (!cancelled) s.blobs.set(name, URL.createObjectURL(blob))
        } catch {
          // 下载失败就继续用网络地址
        }
      }
    })()
    return () => {
      cancelled = true
      clearInterval(timer)
      s.blobs.forEach((u) => URL.revokeObjectURL(u))
      s.blobs.clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [set, finish])

  // 上层的状态变了：决定播哪个片段
  useEffect(() => {
    const s = st.current
    const want = ANIM_CLIP[anim]
    if (set.clips[want].loop) {
      const target = resolveLoop(set, want)
      const wasSleeping = s.base === resolveLoop(set, 'sleep') && s.base !== 'idle'
      s.base = target
      if (s.oneShot || s.clip === target) return
      // 入睡和醒来有专门的过渡片段时先播过渡
      if (want === 'sleep' && set.available.has('sleepIn')) return show('sleepIn')
      if (wasSleeping && want !== 'sleep' && set.available.has('wake')) return show('wake')
      return show(target)
    }
    // 动作片段：没准备这个片段就不播；同一个动作正在播时不打断（连续抚摸时不会一直从头开始）
    if (!set.available.has(want) || s.clip === want) return
    show(want)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anim, actionKey, set, show])

  /** 把屏幕上的点换算成视频画面里的比例坐标，再判断落在哪个分区 */
  const zoneAt = (e: PointerEvent): ZoneName | null => {
    const rect = frame.current?.getBoundingClientRect()
    if (!rect || !rect.width) return null
    const u = (e.clientX - rect.left) / rect.width
    const v = (e.clientY - rect.top) / rect.height
    for (const name of ZONE_ORDER) {
      const z = set.zones[name]
      if (((u - z.x) / z.rx) ** 2 + ((v - z.y) / z.ry) ** 2 <= 1) return name
    }
    return null
  }

  const down = (e: PointerEvent) => {
    const zone = zoneAt(e)
    const s = st.current
    if (zone === 'nose') {
      // 点完之后手指难免会动一下，短时间内不要把它当成抚摸
      s.lastStroke = performance.now() + 900
      onBoop()
    } else if (zone === 'body') {
      s.lastStroke = performance.now() + 700
      onPoke()
    } else if (zone) {
      s.lastStroke = performance.now()
      onPet()
    }
  }
  const move = (e: PointerEvent) => {
    // 手指（或按住的鼠标）在头上划动 = 连续抚摸
    if (e.pointerType === 'mouse' && e.buttons === 0) return
    const now = performance.now()
    if (now - st.current.lastStroke < 380) return
    const zone = zoneAt(e)
    if (!zone || zone === 'body') return
    st.current.lastStroke = now
    onPet()
  }

  // 画面按屏幕宽度完整显示、顶部对齐（不裁掉两侧）；底部多出来的空隙由渐变和控件盖住
  const [w, h] = dims ?? [9, 16]
  return (
    <div className="video-pet" onPointerDown={down} onPointerMove={move}>
      <div
        ref={frame}
        className="video-frame"
        style={{ aspectRatio: `${w} / ${h}`, transform: `translateY(${set.offsetY * 100}%)` }}
      >
        {vids.map((ref, i) => (
          <video
            key={i}
            ref={ref}
            muted
            playsInline
            preload="auto"
            disablePictureInPicture
            onEnded={finish}
            onLoadedMetadata={(e) => setDims([e.currentTarget.videoWidth, e.currentTarget.videoHeight])}
          />
        ))}
        {DEBUG && (
          // 调试：把触摸分区画出来，方便对着视频校准
          <svg className="zones" viewBox="0 0 1 1" preserveAspectRatio="none">
            {ZONE_ORDER.map((name) => {
              const z = set.zones[name]
              return <ellipse key={name} cx={z.x} cy={z.y} rx={z.rx} ry={z.ry} />
            })}
          </svg>
        )}
      </div>
    </div>
  )
}

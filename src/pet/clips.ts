// 互动视频模式：片段清单、触摸分区，以及"哪些片段已经放进来了"的探测。
// 视频文件放在 public/clips/ 下，文件名就是片段名，例如 public/clips/idle.mp4。

/** 宠物当前的动作或状态 */
export type Anim = 'idle' | 'eat' | 'play' | 'pet' | 'boop' | 'poke' | 'talk' | 'listen' | 'sleep' | 'sad'

export type ClipName =
  | 'idle'
  | 'pet'
  | 'boop'
  | 'poke'
  | 'eat'
  | 'play'
  | 'sleepIn'
  | 'sleep'
  | 'wake'
  | 'talk'
  | 'listen'
  | 'sad'

export interface ClipDef {
  /** true = 状态片段，循环播放；false = 动作片段，播一遍后回到状态片段 */
  loop: boolean
  /** 只取视频的这一段（秒），用来裁掉开头或结尾不理想的部分 */
  start?: number
  end?: number
  /**
   * 循环片段专用：第一次从 start 播起（可以包含"进入这个状态"的过程，比如慢慢睡着），
   * 之后每次循环只回到这个时间点，不再重复进入的过程。
   */
  loopStart?: number
}

export const CLIPS: Record<ClipName, ClipDef> = {
  idle: { loop: true },
  talk: { loop: true },
  listen: { loop: true },
  sleep: { loop: true },
  sad: { loop: true },
  pet: { loop: false },
  boop: { loop: false },
  poke: { loop: false },
  eat: { loop: false },
  play: { loop: false },
  sleepIn: { loop: false },
  wake: { loop: false },
}

/** 状态片段缺失时用哪个顶替；只有 idle 是必须的 */
const LOOP_FALLBACK: Partial<Record<ClipName, ClipName>> = {
  talk: 'idle',
  listen: 'idle',
  sad: 'idle',
  sleep: 'idle',
}

/** 触摸分区：椭圆，坐标是视频画面里的比例（左上角为 0,0，右下角为 1,1） */
export interface Zone {
  x: number
  y: number
  rx: number
  ry: number
}
export type ZoneName = 'nose' | 'earL' | 'earR' | 'head' | 'body'
export type Zones = Record<ZoneName, Zone>

/** 默认分区按参考图的构图估的；换了视频后可以在 public/clips/config.json 里覆盖 */
const DEFAULT_ZONES: Zones = {
  nose: { x: 0.45, y: 0.635, rx: 0.11, ry: 0.045 },
  earL: { x: 0.25, y: 0.44, rx: 0.15, ry: 0.1 },
  earR: { x: 0.75, y: 0.435, rx: 0.15, ry: 0.1 },
  head: { x: 0.5, y: 0.55, rx: 0.43, ry: 0.19 },
  body: { x: 0.5, y: 0.88, rx: 0.46, ry: 0.15 },
}
/** 判定顺序：先小后大，重叠时小的优先 */
export const ZONE_ORDER: ZoneName[] = ['nose', 'earL', 'earR', 'head', 'body']

export interface ClipSet {
  available: Set<ClipName>
  clips: Record<ClipName, ClipDef>
  zones: Zones
  /** 画面整体上下平移，单位是视频画面高度的比例（负数向上） */
  offsetY: number
}

const base = `${import.meta.env.BASE_URL}clips/`
export const clipUrl = (name: ClipName) => `${base}${name}.mp4`

/** 把想播的状态片段换成实际存在的那个 */
export function resolveLoop(set: ClipSet, name: ClipName): ClipName {
  if (set.available.has(name)) return name
  const fb = LOOP_FALLBACK[name]
  return fb && set.available.has(fb) ? fb : 'idle'
}

interface ConfigFile {
  offsetY?: number
  zones?: Partial<Zones>
  clips?: Partial<Record<ClipName, Partial<ClipDef>>>
}

/**
 * 探测 public/clips/ 里有哪些片段。没有 idle.mp4 时返回 null，界面会显示"还没有宠物视频"的提示。
 * 开发服务对不存在的文件会返回网页，所以要看返回的类型是不是视频。
 */
export async function probeClips(): Promise<ClipSet | null> {
  const names = Object.keys(CLIPS) as ClipName[]
  const found = await Promise.all(
    names.map(async (name) => {
      try {
        const res = await fetch(clipUrl(name), { method: 'HEAD' })
        return res.ok && (res.headers.get('content-type') ?? '').startsWith('video/')
      } catch {
        return false
      }
    }),
  )
  const available = new Set(names.filter((_, i) => found[i]))
  if (!available.has('idle')) return null

  let config: ConfigFile = {}
  try {
    const res = await fetch(`${base}config.json`)
    if (res.ok && (res.headers.get('content-type') ?? '').includes('json')) config = (await res.json()) as ConfigFile
  } catch {
    // 没有配置文件就用默认值
  }
  const clips = { ...CLIPS }
  for (const name of names) clips[name] = { ...CLIPS[name], ...config.clips?.[name] }
  return { available, clips, zones: { ...DEFAULT_ZONES, ...config.zones }, offsetY: config.offsetY ?? 0 }
}

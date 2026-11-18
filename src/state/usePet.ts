import { useCallback, useEffect, useRef, useState } from 'react'
import { PET, line } from '../pet.config'

export interface PetState {
  name: string
  /** 饱食度，100 = 很饱 */
  satiety: number
  mood: number
  energy: number
  /** 亲密度，只增不减 */
  affection: number
  sleeping: boolean
  updatedAt: number
}

const KEY = 'ai-pet/state/v1'
const clamp = (n: number) => Math.max(0, Math.min(100, n))

const fresh = (): PetState => ({
  name: PET.name,
  satiety: 70,
  mood: 70,
  energy: 80,
  affection: 5,
  sleeping: false,
  updatedAt: Date.now(),
})

/** 按流逝的时间推进数值；离线时间最多按 12 小时计算，免得一晚没来就全部归零。 */
export function advance(s: PetState, now: number): PetState {
  const min = Math.min(Math.max(0, now - s.updatedAt) / 60000, 720)
  if (min === 0) return s
  let { satiety, mood, energy, sleeping } = s
  if (sleeping) {
    energy = clamp(energy + 1.5 * min)
    satiety = clamp(satiety - 0.25 * min)
    if (energy >= 100) sleeping = false
  } else {
    satiety = clamp(satiety - 0.7 * min)
    energy = clamp(energy - 0.35 * min)
    mood = clamp(mood - (satiety < 30 ? 0.9 : 0.4) * min)
  }
  return { ...s, satiety, mood, energy, sleeping, updatedAt: now }
}

function load(): { state: PetState; awayMs: number } {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const saved = { ...fresh(), ...(JSON.parse(raw) as Partial<PetState>) }
      const now = Date.now()
      return { state: advance(saved, now), awayMs: now - saved.updatedAt }
    }
  } catch {
    // 存档损坏或本地存储不可用时，从头开始
  }
  return { state: fresh(), awayMs: -1 }
}

export type ActionResult = { ok: boolean; line: string }

export function usePet() {
  const initial = useRef<ReturnType<typeof load> | null>(null)
  if (!initial.current) initial.current = load()
  const [pet, setPet] = useState<PetState>(initial.current.state)
  const petRef = useRef(pet)
  petRef.current = pet

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(pet))
    } catch {
      // 忽略：没有存档也能玩
    }
  }, [pet])

  useEffect(() => {
    const id = setInterval(() => setPet((s) => advance(s, Date.now())), 5000)
    return () => clearInterval(id)
  }, [])

  const patch = useCallback((fn: (s: PetState) => Partial<PetState>) => {
    setPet((s) => {
      const cur = advance(s, Date.now())
      return { ...cur, ...fn(cur) }
    })
  }, [])

  const feed = useCallback((): ActionResult => {
    const s = petRef.current
    if (s.satiety > 92) return { ok: false, line: line('tooFull', s.name) }
    patch((c) => ({
      sleeping: false,
      satiety: clamp(c.satiety + 28),
      mood: clamp(c.mood + 5),
      affection: clamp(c.affection + 1),
    }))
    return { ok: true, line: line(s.satiety < 30 ? 'eatHungry' : 'eat', s.name) }
  }, [patch])

  const play = useCallback((): ActionResult => {
    const s = petRef.current
    if (s.energy < 15) return { ok: false, line: line('tooTiredToPlay', s.name) }
    if (s.satiety < 12) return { ok: false, line: line('tooHungryToPlay', s.name) }
    patch((c) => ({
      sleeping: false,
      mood: clamp(c.mood + 22),
      energy: clamp(c.energy - 15),
      satiety: clamp(c.satiety - 8),
      affection: clamp(c.affection + 2),
    }))
    return { ok: true, line: line('play', s.name) }
  }, [patch])

  const stroke = useCallback(() => {
    patch((c) => ({
      mood: clamp(c.mood + 2.5),
      affection: clamp(c.affection + 0.4),
    }))
  }, [patch])

  const toggleSleep = useCallback((): ActionResult => {
    const s = petRef.current
    if (s.sleeping) {
      patch(() => ({ sleeping: false }))
      return { ok: true, line: line('wakeUp', s.name) }
    }
    if (s.energy > 90) return { ok: false, line: line('notSleepy', s.name) }
    patch(() => ({ sleeping: true }))
    return { ok: true, line: line('goodNight', s.name) }
  }, [patch])

  const wake = useCallback(() => patch(() => ({ sleeping: false })), [patch])
  const bond = useCallback(
    (n: number) => patch((c) => ({ affection: clamp(c.affection + n), mood: clamp(c.mood + n) })),
    [patch],
  )
  const rename = useCallback((name: string) => patch(() => ({ name })), [patch])

  return { pet, awayMs: initial.current.awayMs, feed, play, stroke, toggleSleep, wake, bond, rename }
}

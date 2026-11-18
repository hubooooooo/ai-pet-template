// 摄像头互动：在手机本地识别人脸和手势，把"看到了什么"变成事件交给界面。
// 画面只在本机处理，不上传、不保存。识别库和模型都随应用一起提供（public/mediapipe）。

export type CamEvent =
  | 'appear' // 你出现在镜头前
  | 'smile' // 你笑了
  | 'wave' // 你对它张开手掌打招呼
  | 'near' // 你把脸凑得很近
  | 'leave' // 你离开了一会儿
  | 'gone' // 你长时间不在

export interface CameraSession {
  stream: MediaStream
  stop: () => void
}

const BASE = `${import.meta.env.BASE_URL}mediapipe/`

/** 每秒识别约 4 次：足够做这些互动，又不至于让手机发烫 */
const INTERVAL = 260
const COOLDOWN = 8000
const LEAVE_AFTER = 8000
const GONE_AFTER = 60000

export function cameraSupported() {
  return window.isSecureContext && !!navigator.mediaDevices?.getUserMedia
}

export async function startCamera(
  onEvent: (e: CamEvent) => void,
  onStatus?: (text: string) => void,
): Promise<CameraSession> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } },
  })
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.srcObject = stream
  let stopped = false
  let timer = 0
  const stop = () => {
    stopped = true
    clearTimeout(timer)
    stream.getTracks().forEach((t) => t.stop())
    video.srcObject = null
  }

  try {
    await video.play()
    const { FilesetResolver, FaceLandmarker, GestureRecognizer } = await import('@mediapipe/tasks-vision')
    const fileset = await FilesetResolver.forVisionTasks(`${BASE}wasm`)
    // 优先用显卡，不支持时退回处理器
    const create = async <T>(make: (delegate: 'GPU' | 'CPU') => Promise<T>) => {
      try {
        return await make('GPU')
      } catch {
        return await make('CPU')
      }
    }
    const face = await create((delegate) =>
      FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: `${BASE}face_landmarker.task`, delegate },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,
      }),
    )
    const hand = await create((delegate) =>
      GestureRecognizer.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: `${BASE}gesture_recognizer.task`, delegate },
        runningMode: 'VIDEO',
        numHands: 1,
      }),
    )
    if (stopped) {
      face.close()
      hand.close()
      return { stream, stop }
    }

    const startedAt = performance.now()
    let present = false
    let seen = 0 // 连续看到人脸的次数
    let lastSeen = startedAt
    let leaveSent = false
    let goneSent = false
    let smileRun = 0
    let nearRun = 0
    let palmRun = 0
    let tick = 0
    const last: Partial<Record<CamEvent, number>> = {}
    const fire = (e: CamEvent, now: number) => {
      if (now - (last[e] ?? -1e9) < COOLDOWN) return
      last[e] = now
      onEvent(e)
    }

    const loop = () => {
      if (stopped) return
      timer = window.setTimeout(loop, INTERVAL)
      if (video.readyState < 2 || document.hidden) return
      const now = performance.now()
      tick++

      const res = face.detectForVideo(video, now)
      const marks = res.faceLandmarks[0]
      if (marks) {
        seen++
        lastSeen = now
        if (!present && seen >= 2) {
          present = true
          leaveSent = goneSent = false
          fire('appear', now)
        }
        const shapes = res.faceBlendshapes?.[0]?.categories ?? []
        const score = (name: string) => shapes.find((c) => c.categoryName === name)?.score ?? 0
        const smile = (score('mouthSmileLeft') + score('mouthSmileRight')) / 2
        let minX = 1
        let maxX = 0
        for (const p of marks) {
          if (p.x < minX) minX = p.x
          if (p.x > maxX) maxX = p.x
        }
        const size = maxX - minX // 脸占画面宽度的比例
        smileRun = smile > 0.55 ? smileRun + 1 : 0
        nearRun = size > 0.62 ? nearRun + 1 : 0
        // 刚出现的头两秒不触发，免得一打开就连着蹦出好几句话
        if (present && now - (last.appear ?? 0) > 2000) {
          if (nearRun >= 2) fire('near', now)
          else if (smileRun >= 2) fire('smile', now)
        }
        onStatus?.(`看到你了 · 笑容 ${smile.toFixed(2)} · 距离 ${size.toFixed(2)}`)
      } else {
        seen = 0
        smileRun = nearRun = 0
        const away = now - lastSeen
        if (present && away > 2500) present = false
        if (!leaveSent && away > LEAVE_AFTER && lastSeen > startedAt) {
          leaveSent = true
          onEvent('leave')
        }
        if (!goneSent && away > GONE_AFTER) {
          goneSent = true
          onEvent('gone')
        }
        onStatus?.('没看到人')
      }

      // 手势隔一次识别一次，省一半的计算
      if (tick % 2 === 0) {
        const g = hand.recognizeForVideo(video, now + 1).gestures[0]?.[0]
        palmRun = g && g.categoryName === 'Open_Palm' && g.score > 0.6 ? palmRun + 1 : 0
        if (palmRun >= 2) fire('wave', now)
      }
    }
    loop()

    const stopAll = () => {
      stop()
      face.close()
      hand.close()
    }
    return { stream, stop: stopAll }
  } catch (err) {
    stop()
    throw err
  }
}

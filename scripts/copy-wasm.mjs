// 把摄像头识别库的运行文件从 node_modules 复制到 public/mediapipe/wasm。
// 这些文件有 29MB 且可以随时重新生成，所以不放进 git；npm install 后会自动运行本脚本。
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const from = join(root, 'node_modules/@mediapipe/tasks-vision/wasm')
const to = join(root, 'public/mediapipe/wasm')

if (existsSync(from)) {
  mkdirSync(to, { recursive: true })
  cpSync(from, to, { recursive: true })
}

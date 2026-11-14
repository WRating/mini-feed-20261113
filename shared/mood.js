/**
 * 心情键 ↔ 展示信息的解析 —— 前后端共用。
 *
 * 为什么单独抽一层：白名单校验（后端拒绝非法值）与展示映射（前端渲染表情/文案）
 * 如果各写一份，迟早出现「后端认这个 key、前端查不到对应表情」而渲染空白。
 * 这里把两者放在一起，两端调用同一份实现。
 */
import { MOODS, MOOD_KEYS, DEFAULT_MOOD } from './constants.js'

/** 是否为合法的心情键 */
export function isValidMood(key) {
  return MOOD_KEYS.includes(key)
}

/**
 * 把一个可能是任意值的输入解析为合法心情的展示信息。
 *
 * 非法输入（undefined、null、拼错的 key、数字、对象）一律回落到默认心情 ——
 * 心情只是装饰性信息，为它报错或渲染空白都不值得，稳住界面更重要。
 * 注意：**后端校验用 isValidMood 显式报错**，这个函数只用于「展示时的兜底」。
 */
export function resolveMood(key) {
  const found = MOODS.find((mood) => mood.key === key)
  if (found) return found
  return MOODS.find((mood) => mood.key === DEFAULT_MOOD) || MOODS[0]
}

/** 只取展示所需的三个字段，避免把 MOODS 里的对象引用直接泄露给调用方 */
export function moodView(key) {
  const { key: resolvedKey, emoji, label } = resolveMood(key)
  return { key: resolvedKey, emoji, label }
}

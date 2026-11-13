/**
 * 动态实体相关纯函数：长度约束、创建、校验、排序、去重。
 * 不含任何存储或响应式依赖，方便被 store 与测试复用。
 */
import { MAX_LEN } from '@shared/constants'

// 从共享常量 re-export：这个模块曾是 MAX_LEN 的定义处，外部调用方（store / 组件 / 测试）
// 都从这里取。改成 re-export 后既保证「唯一真源在 shared」，又不破坏既有 import 路径。
export { MAX_LEN }

/** 内容规范化：非字符串视为空串，去掉首尾空白 */
export function normalizeText(value) {
  if (typeof value !== 'string') return ''
  return value.trim()
}

/** 是否允许发布：trim 后非空且不超过上限 */
export function canPublish(value) {
  const text = normalizeText(value)
  return text.length > 0 && text.length <= MAX_LEN
}

let seq = 0

/** 生成动态 id：时间戳 + 自增序号 + 随机段，避免同一毫秒内重复 */
function createId() {
  seq = (seq + 1) % 10_000
  return `mf${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/**
 * 创建一条动态。
 * - 内容先 trim 再入库
 * - 超长自动截断到 MAX_LEN（而不是抛错，保证导入外部数据时不会崩）
 * - 可通过 overrides 注入 id / createdAt，便于测试与导入
 */
export function createPost(text, overrides = {}) {
  const normalized = normalizeText(text)
  const sliced = normalized.length > MAX_LEN ? normalized.slice(0, MAX_LEN) : normalized
  return {
    id: overrides.id ?? createId(),
    text: sliced,
    createdAt: Number.isFinite(overrides.createdAt) ? overrides.createdAt : Date.now()
  }
}

/** 校验一条动态是否合法（用于读取存储与导入备份时的过滤） */
export function isValidPost(post) {
  if (!post || typeof post !== 'object') return false
  if (typeof post.text !== 'string') return false
  const time = post.createdAt
  return typeof time === 'number' && Number.isFinite(time)
}

/** 按创建时间倒序排列，返回新数组（不改动入参） */
export function sortByCreatedAtDesc(list) {
  return [...list].sort((a, b) => b.createdAt - a.createdAt)
}

/** 备份导入的去重依据：内容 + 时间 */
export function dedupeKey(post) {
  return `${post.text}@${post.createdAt}`
}

/** 目标动态是否已存在于列表中 */
export function isDuplicate(list, candidate) {
  const key = dedupeKey(candidate)
  return list.some((item) => dedupeKey(item) === key)
}

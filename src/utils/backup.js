/**
 * 备份文件的构建与解析。
 *
 * 解析属于**不可信输入处理**：任何异常都转成 { ok:false, error } 的可读结果，
 * 绝不向调用方抛错，也绝不把未校验的数据往外传。
 *
 * 版本演进：v1 没有互动字段，v2 起每条动态附带 interactions（likes / favorites /
 * liked / favorited）。**读取路径必须同时兼容 v1** —— 用户手里可能还存着旧备份，
 * 不能因为升级就让他们无法恢复数据；缺失的互动字段按 0 / false 补齐。
 * 版本号取自 shared/constants，避免前后端与备份格式三处各写一个魔数。
 */
import { MAX_LEN, sortByCreatedAtDesc, dedupeKey } from './post'
import { BACKUP_VERSION as SHARED_BACKUP_VERSION } from '@shared/constants'
import { normalizeReactions } from '@shared/post-shape'

export const BACKUP_VERSION = SHARED_BACKUP_VERSION
export const BACKUP_APP = 'minifeed'

const DEFAULT_PROFILE = {
  name: '',
  bio: '',
  avatar: '🙂',
  joinedAt: 0
}

/**
 * 生成备份对象（深拷贝，避免与 store 共享引用）。
 * 每条动态都补全互动字段：这样导入时无需再猜「这条到底有没有互动信息」，
 * 且同一份备份导入两次得到相同结果（目标状态语义）。
 */
export function buildBackup({ posts = [], profile = null, now = Date.now() } = {}) {
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date(now).toISOString(),
    profile: profile ? { ...profile } : null,
    posts: posts.map((post) => ({
      ...post,
      ...normalizeReactions(post)
    }))
  }
}

/** 把不可信的资料对象补全为完整结构 */
function normalizeProfile(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  return {
    name: typeof raw.name === 'string' ? raw.name : DEFAULT_PROFILE.name,
    bio: typeof raw.bio === 'string' ? raw.bio : DEFAULT_PROFILE.bio,
    avatar: typeof raw.avatar === 'string' && raw.avatar ? raw.avatar : DEFAULT_PROFILE.avatar,
    joinedAt: Number.isFinite(raw.joinedAt) ? raw.joinedAt : Date.now()
  }
}

/**
 * 把不可信动态条目规范化为合法结构。
 * - 只保留 text 是非空字符串、createdAt 是有限数字的条目
 * - 超长截断而非丢弃
 * - 缺 id 时补一个（用去重键派生，保证同一文件内稳定）
 * - 互动字段走 shared 的 normalizeReactions：v1 备份（无这些字段）自动得到全 0 / false，
 *   带脏互动数据的备份也会被修正为自洽值
 */
function normalizePost(raw, index) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  if (typeof raw.text !== 'string') return null
  if (!Number.isFinite(raw.createdAt)) return null

  let text = raw.text.trim()
  if (!text) return null
  if (text.length > MAX_LEN) text = text.slice(0, MAX_LEN)

  const id =
    typeof raw.id === 'string' && raw.id
      ? raw.id
      : `imported-${raw.createdAt}-${index}-${text.slice(0, 8)}`

  return { id, text, createdAt: raw.createdAt, ...normalizeReactions(raw) }
}

const fail = (error) => ({ ok: false, error, posts: [], profile: null, skipped: 0 })

/**
 * 解析备份内容（接受 JSON 字符串或已解析的对象）。
 * 成功：{ ok:true, posts, profile, skipped }
 * 失败：{ ok:false, error, posts:[], profile:null, skipped:0 }
 */
export function parseBackup(input) {
  let data = input

  if (typeof input === 'string') {
    const text = input.trim()
    if (!text) return fail('文件内容为空')
    try {
      data = JSON.parse(text)
    } catch {
      return fail('不是合法的 JSON 文件')
    }
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return fail('备份文件格式不正确，应为 JSON 对象')
  }

  if (!Array.isArray(data.posts)) {
    return fail('文件缺少 posts 数组')
  }

  const normalized = []
  const seen = new Set()
  let skipped = 0

  data.posts.forEach((raw, index) => {
    const post = normalizePost(raw, index)
    if (!post) {
      skipped += 1
      return
    }
    const key = dedupeKey(post)
    if (seen.has(key)) {
      skipped += 1
      return
    }
    seen.add(key)
    normalized.push(post)
  })

  if (normalized.length === 0 && skipped > 0) {
    return fail('文件中没有有效的动态数据')
  }

  return {
    ok: true,
    error: null,
    posts: sortByCreatedAtDesc(normalized),
    profile: normalizeProfile(data.profile),
    skipped
  }
}

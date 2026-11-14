/**
 * 前后端共享常量 —— 唯一真源。
 *
 * 这些值同时被浏览器端（Vite）与 Node 服务端导入。
 * 放在这里是为了避免「前端限制 280、后端限制 200」这类漂移；
 * 如需调整，只改这一处。
 */

/** 单条动态的字符上限 */
export const MAX_LEN = 280

/** 昵称与简介的长度上限 */
export const NAME_MAX = 20
export const BIO_MAX = 60

/** 可选头像白名单（顺序即 UI 展示顺序） */
export const AVATARS = ['🙂', '😀', '🐱', '🐼', '🦊', '🚀', '🌙', '🍀', '🎧', '📚']

export const DEFAULT_NAME = '我'
export const DEFAULT_BIO = '这个人很懒，什么都没写。'
export const DEFAULT_AVATAR = '🙂'

/** 前端访问后端的基址；开发期由 Vite 代理到 127.0.0.1:8787 */
export const API_BASE = '/api'

/** 后端默认端口 */
export const DEFAULT_PORT = 8787

/** 去重键分隔符：用不可见字符，避免与正文内容冲突 */
export const DEDUPE_SEP = '\u0000'

/** 合并导入时生成兜底 id 的前缀 */
export const IMPORTED_ID_PREFIX = 'imported-'

/** 统一错误码 */
export const ERROR_CODES = {
  INVALID: 'INVALID',
  EMPTY: 'EMPTY',
  TOO_LONG: 'TOO_LONG',
  INVALID_AVATAR: 'INVALID_AVATAR',
  INVALID_MOOD: 'INVALID_MOOD',
  NOT_FOUND: 'NOT_FOUND',
  BAD_JSON: 'BAD_JSON'
}

/* ==================== 点赞与收藏 ==================== */

/** 可切换的互动类型 —— 前后端与 URL 参数共用，避免各自写字符串字面量 */
export const REACTION_KINDS = ['like', 'favorite']

/**
 * 互动动作。
 * POST 用 Toggle（幂等地从"有"变成"无"、从"无"变成"有"），
 * PUT/DELETE 用于备份导入这种需要明确指定目标状态的场景 —— 重复导入同一份
 * 备份必须得到相同结果，用 toggle 会反复翻转。
 */
export const REACTION_ACTIONS = { TOGGLE: 'toggle', ADD: 'add', REMOVE: 'remove' }

/** 单条动态的空互动状态，用于断言与兜底 */
export const EMPTY_REACTIONS = { likes: 0, favorites: 0, liked: false, favorited: false }

/** 备份文件结构版本。v1 没有互动字段，v2 起附带 reactions */
export const BACKUP_VERSION = 2

/* ==================== 心情 ==================== */

/**
 * 可选心情白名单（顺序即 UI 展示顺序）。
 * 心情是「个人状态」，归属 profile —— 复用 PUT /api/profile 即可，
 * 不需要新端点，也因此自动获得备份导出 / 导入的覆盖。
 */
export const MOODS = [
  { key: 'great', emoji: '😄', label: '心情好' },
  { key: 'calm', emoji: '🙂', label: '平静' },
  { key: 'tired', emoji: '😮‍💨', label: '有点累' },
  { key: 'down', emoji: '😔', label: '低落' },
  { key: 'fired', emoji: '🔥', label: '干劲满满' }
]

/** 心情键列表，便于做白名单校验 */
export const MOOD_KEYS = MOODS.map((mood) => mood.key)

export const DEFAULT_MOOD = 'great'


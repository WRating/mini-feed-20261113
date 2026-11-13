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
  NOT_FOUND: 'NOT_FOUND',
  BAD_JSON: 'BAD_JSON'
}

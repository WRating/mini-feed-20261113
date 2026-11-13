/**
 * 内存数据仓库 —— 服务端的唯一状态来源。
 *
 * 设计要点（为什么这样写）：
 *
 * 1. **工厂而非单例**：`createStore()` 每次返回一套全新的闭包状态。
 *    单例会跨测试用例串数据，也会让「服务重启即清空」的语义产生歧义。
 *    入口 `server/index.js` 负责创建唯一实例。
 *
 * 2. **服务端独立实现**：语义与 `src/utils/post.js`、`src/utils/backup.js` 对齐
 *    （trim、倒序、text+createdAt 去重、超长截断），但不 import 它们。
 *    原因：`src/` 是浏览器端代码，会被打包进前端产物；服务端依赖它会把两端
 *    「耦合死」，任何一次前端重构都可能悄悄改变后端行为。两端共享的只有
 *    `shared/constants.js` 里的"魔数"，那才是必须一致的契约。
 *
 * 3. **校验失败抛带 code 的 Error**：`error.code` 直接取自 `ERROR_CODES`，
 *    HTTP 层只做 code → 状态码的映射，不再重复判断业务规则。
 *
 * 4. **返回副本**：所有读接口都返回深拷贝，防止调用方（或测试）意外改写内部
 *    状态，避免"改了返回值却发现数据没变/变了"的隐形 bug。
 */

import {
  MAX_LEN,
  NAME_MAX,
  BIO_MAX,
  AVATARS,
  DEFAULT_NAME,
  DEFAULT_BIO,
  DEFAULT_AVATAR,
  DEDUPE_SEP,
  ERROR_CODES
} from '../shared/constants.js'

/** 构造带 code 的业务错误。code 供 HTTP 层映射状态码，message 直接给前端展示。 */
function createError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

/** 是否为「普通对象」（排除 null 与数组，它们是 JSON 里最常见的两种误传） */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 内容规范化：非字符串一律不合法，字符串去掉首尾空白 */
function trimText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

/** 截断到上限：只在超限时切，避免无谓的字符串拷贝 */
function clamp(value, max) {
  return value.length > max ? value.slice(0, max) : value
}

/** 去重键：内容 + 不可见分隔符 + 时间，与契约 4.7 一致 */
function dedupeKey(post) {
  return `${post.text}${DEDUPE_SEP}${post.createdAt}`
}

export function createStore() {
  /** @type {Array<{id: string, text: string, createdAt: number}>} 内部存储，永不外泄引用 */
  let posts = []

  /** 自增序号：同一毫秒内连续创建时保证 id 不重复 */
  let seq = 0

  function createId() {
    seq = (seq + 1) % 10_000
    return `mf${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`
  }

  /** 默认资料工厂：joinedAt 用当前时间，reset 时重新调用即可刷新 */
  function createDefaultProfile() {
    return {
      name: DEFAULT_NAME,
      bio: DEFAULT_BIO,
      avatar: DEFAULT_AVATAR,
      joinedAt: Date.now()
    }
  }

  let profile = createDefaultProfile()

  /**
   * 校验并规范化资料字段。
   *
   * 单独抽出来是为了让 `updateProfile` 与 `restoreProfile` 走**同一套**规则：
   * 两个接口如果各写一份 trim/截断逻辑，迟早会漂移。
   *
   * 关键约束：先整体校验再合并 —— 任意一个字段非法就整体拒绝，
   * 不能出现「name 改了但 avatar 报错」的半提交状态。
   *
   * @returns {{name?: string, bio?: string, avatar?: string}} 只含传入字段的补丁
   */
  function normalizeProfilePatch(source) {
    if (!isPlainObject(source)) {
      throw createError(ERROR_CODES.INVALID, '资料必须是对象')
    }

    const patch = {}

    if (source.name !== undefined) {
      if (typeof source.name !== 'string') {
        throw createError(ERROR_CODES.INVALID, '昵称必须是字符串')
      }
      // 契约 4.10：trim 后为空回退默认值，超长截断（不报错）
      const name = clamp(trimText(source.name), NAME_MAX)
      patch.name = name || DEFAULT_NAME
    }

    if (source.bio !== undefined) {
      if (typeof source.bio !== 'string') {
        throw createError(ERROR_CODES.INVALID, '简介必须是字符串')
      }
      // 简介允许为空串，只截断
      patch.bio = clamp(trimText(source.bio), BIO_MAX)
    }

    if (source.avatar !== undefined) {
      // 区分两种失败：类型不对算参数错误（INVALID），
      // 类型对但不在白名单才算头像非法（INVALID_AVATAR）。
      // 契约 4.10 要求非法头像必须报错而不是静默忽略，便于尽早暴露前端 bug。
      if (typeof source.avatar !== 'string') {
        throw createError(ERROR_CODES.INVALID, '头像必须是字符串')
      }
      if (!AVATARS.includes(source.avatar)) {
        throw createError(ERROR_CODES.INVALID_AVATAR, '头像不在可选列表中')
      }
      patch.avatar = source.avatar
    }

    // 注意：这里刻意**不读取** source.joinedAt。
    // joinedAt 只在创建资料/重置资料时产生，任何外部 patch 都无法改写。

    return patch
  }

  return {
    /** 全部动态，按 createdAt 倒序（新的在前）。空仓库返回空数组。 */
    listPosts() {
      return [...posts]
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((post) => ({ ...post }))
    },

    /** 单条查询；未命中返回 undefined，由 HTTP 层转 404 */
    getPost(id) {
      const found = posts.find((post) => post.id === id)
      return found ? { ...found } : undefined
    },

    /**
     * 发布动态。
     * 与导入不同，发布是**用户主动输入**，超长应当报错而不是静默截断 ——
     * 否则用户会以为内容完整保存了。
     */
    addPost(text) {
      if (typeof text !== 'string') {
        throw createError(ERROR_CODES.INVALID, '内容必须是字符串')
      }

      const normalized = text.trim()
      if (!normalized) {
        throw createError(ERROR_CODES.EMPTY, '内容不能为空')
      }
      if (normalized.length > MAX_LEN) {
        throw createError(ERROR_CODES.TOO_LONG, `内容不能超过 ${MAX_LEN} 字`)
      }

      const post = { id: createId(), text: normalized, createdAt: Date.now() }
      posts.push(post)
      return { ...post }
    },

    /** 删除动态；返回是否真的删掉了（供 HTTP 层决定 204 还是 404） */
    removePost(id) {
      const before = posts.length
      posts = posts.filter((post) => post.id !== id)
      return posts.length < before
    },

    /**
     * 合并导入（契约 4.7）。
     *
     * 与 `addPost` 的差别是「宽进」：
     * - 非法条目计入 skipped 而不抛错，保证一次导入不会因为一条脏数据全盘失败
     * - 超长正文截断而非报错，尽量保住用户数据
     * - 缺 id 时补一个，保证后续可以单条删除
     */
    mergePosts(items) {
      if (!Array.isArray(items)) {
        throw createError(ERROR_CODES.INVALID, 'posts 必须是数组')
      }

      // 已有数据先建索引，避免 O(n²)
      const existing = new Set(posts.map(dedupeKey))
      let added = 0
      let skipped = 0

      items.forEach((raw, index) => {
        if (!isPlainObject(raw)) {
          skipped += 1
          return
        }
        if (typeof raw.text !== 'string' || !Number.isFinite(raw.createdAt)) {
          skipped += 1
          return
        }

        const text = clamp(raw.text.trim(), MAX_LEN)
        if (!text) {
          skipped += 1
          return
        }

        const candidate = {
          // 缺失/空 id 时用「时间 + 下标 + 正文前缀」派生，保证同一批导入稳定可复现
          id:
            typeof raw.id === 'string' && raw.id
              ? raw.id
              : `imported-${raw.createdAt}-${index}-${text.slice(0, 8)}`,
          text,
          createdAt: raw.createdAt
        }

        const key = dedupeKey(candidate)
        if (existing.has(key)) {
          skipped += 1
          return
        }

        existing.add(key)
        posts.push(candidate)
        added += 1
      })

      return { added, skipped }
    },

    /** 清空动态，但保留个人资料（契约 4.8） */
    clearPosts() {
      posts = []
    },

    getProfile() {
      return { ...profile }
    },

    /** 局部更新资料；joinedAt 不可改 */
    updateProfile(patch) {
      const normalized = normalizeProfilePatch(patch)
      profile = { ...profile, ...normalized }
      return { ...profile }
    },

    /**
     * 从备份恢复资料（契约 4.11）。
     *
     * 只在「当前资料仍是默认值」时应用，是为了保护用户：
     * 备份文件可能是很久以前的，贸然覆盖会丢掉用户刚填的资料。
     * 宁可返回 applied:false 让前端提示，也不静默改数据。
     */
    restoreProfile(source) {
      // 先校验，保证无论是否应用，非法输入都能被及时发现
      const normalized = normalizeProfilePatch(source)

      const isDefault =
        profile.name === DEFAULT_NAME &&
        profile.bio === DEFAULT_BIO &&
        profile.avatar === DEFAULT_AVATAR

      if (!isDefault) {
        return { applied: false, profile: { ...profile } }
      }

      // 展开时保留原 joinedAt —— 备份里的 joinedAt 不可信，也不该被恢复
      profile = { ...profile, ...normalized }
      return { applied: true, profile: { ...profile } }
    },

    /** 重置为默认资料；joinedAt 刷新为当前时间 */
    resetProfile() {
      profile = createDefaultProfile()
      return { ...profile }
    },

    /**
     * 统计（契约 4.2）。
     * - chars：正文字符数，用于「一共写了多少字」
     * - bytes：整份数据的 UTF-8 字节数，用于展示真实存储占用（emoji 4 字节）
     *   前端拿不到 Buffer，因此由服务端算好下发。
     */
    stats() {
      return {
        posts: posts.length,
        chars: posts.reduce((sum, post) => sum + post.text.length, 0),
        bytes: Buffer.byteLength(JSON.stringify({ posts, profile }), 'utf8')
      }
    }
  }
}

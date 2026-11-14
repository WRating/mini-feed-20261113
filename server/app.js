/**
 * HTTP 层 —— 把内存仓库包装成 RESTful API。
 *
 * 设计要点（为什么这样写）：
 *
 * 1. **只做「翻译」，不做业务**：路由负责「解析请求 → 调 store → 组装响应」，
 *    所有校验规则都留在 store 里。这样业务规则只有一份，HTTP 层换框架也不会漏规则。
 *
 * 2. **错误集中处理**：store 抛出的 Error 带 `error.code`，这里统一映射成
 *    HTTP 状态码 + `{ error: { code, message } }` 结构（契约第 3 节）。
 *    如果每个 handler 各写一遍 try/catch，迟早会有某个端点漏掉一种错误码。
 *
 * 3. **500 不泄露内部信息**：未知异常只回固定文案。堆栈/内部 message 可能包含
 *    文件路径、依赖实现细节，属于不该给客户端的信息。
 *
 * 4. **工厂而非模块级单例**：`createApp({ store })` 显式注入依赖，
 *    测试可传入全新 store 以做到用例隔离，也便于将来换成别的存储实现。
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { ERROR_CODES, REACTION_ACTIONS } from '../shared/constants.js'

/** 业务错误码 → HTTP 状态码。契约第 3 节表格的代码化。 */
const STATUS_BY_CODE = {
  [ERROR_CODES.INVALID]: 400,
  [ERROR_CODES.EMPTY]: 400,
  [ERROR_CODES.TOO_LONG]: 400,
  [ERROR_CODES.INVALID_AVATAR]: 400,
  [ERROR_CODES.INVALID_MOOD]: 400,
  [ERROR_CODES.BAD_JSON]: 400,
  [ERROR_CODES.NOT_FOUND]: 404
}

/** 构造带 code 的错误，交由 onError 统一映射 */
function httpError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

/** 是否为「普通对象」：排除 null / 数组 / 原始值 */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 读取并校验 JSON 请求体。
 *
 * 契约要求区分两种失败：
 * - 不是合法 JSON → `BAD_JSON`（前端拼错了请求体）
 * - 是 JSON 但不是对象（例如发了 `"abc"` 或 `[1]`）→ `INVALID`（调用方用错了接口）
 * 分开报错能让前端一眼看出是自己序列化错了还是结构用错了。
 */
async function readJsonBody(c) {
  let body
  try {
    body = await c.req.json()
  } catch {
    // Hono 的 c.req.json() 在 body 为空或非法时都会抛，统一归为 BAD_JSON
    throw httpError(ERROR_CODES.BAD_JSON, '请求体不是合法 JSON')
  }

  if (!isPlainObject(body)) {
    throw httpError(ERROR_CODES.INVALID, '请求体必须是 JSON 对象')
  }

  return body
}

/**
 * 读取**可选** JSON 请求体（契约 4.13 用）。
 *
 * 为什么不能直接复用 `readJsonBody`：那个函数把「空 body」也归为 `BAD_JSON`，
 * 而互动接口允许完全不带 body（此时按 toggle 处理）。
 * 所以这里先取原始文本，只有内容非空白时才尝试解析 ——
 * 但**有内容却不是合法 JSON 时仍要报 `BAD_JSON`**，不能悄悄当成 toggle，
 * 否则前端序列化 bug（例如发了 `{action:add}`）会被静默吞掉。
 */
async function readOptionalJsonBody(c) {
  const raw = await c.req.text()
  if (raw.trim() === '') return {}

  let body
  try {
    body = JSON.parse(raw)
  } catch {
    throw httpError(ERROR_CODES.BAD_JSON, '请求体不是合法 JSON')
  }

  if (!isPlainObject(body)) {
    throw httpError(ERROR_CODES.INVALID, '请求体必须是 JSON 对象')
  }

  return body
}

/**
 * 解析互动动作（契约 4.13）。
 *
 * 允许的取值：`toggle` / `add` / `remove`，以及空值（省略 = toggle）。
 * 返回 undefined 表示「按 toggle 处理」。
 *
 * 非空但不在白名单 → `INVALID`：动作是前端可控输入，拼错必须显式报错，
 * 静默降级成 toggle 会让「设为取消」被误解成「翻转」，状态莫名其妙地变。
 */
function parseReactionAction(value) {
  // 空值（缺字段 / null / 空串）统一表示「未指定」，走 toggle 分支
  if (value === undefined || value === null || value === '') return undefined

  if (typeof value !== 'string') {
    throw httpError(ERROR_CODES.INVALID, 'action 必须是字符串')
  }

  const allowed = Object.values(REACTION_ACTIONS)
  if (!allowed.includes(value)) {
    throw httpError(ERROR_CODES.INVALID, `action 只能是 ${allowed.join(' / ')}`)
  }

  return value
}

/**
 * 创建 Hono 应用。
 * @param {{ store: object }} deps 必须显式传入 store —— 缺了就直接失败，
 *   否则会「静默」地每个请求都新建一份数据，表现为写完立刻丢。
 */
export function createApp({ store } = {}) {
  if (!store) {
    throw new Error('createApp 需要传入 store')
  }

  const app = new Hono()

  // 应用启动时刻。health 用它算 uptimeMs —— 用 app 创建时刻而非首次请求时刻，
  // 否则「刚启动」永远显示 0。
  const startedAt = Date.now()

  // 契约 1 节：开发期走 Vite 代理同源，但后端仍需允许 CORS 以便独立调试
  app.use('*', cors())

  // ---------- 4.1 健康检查 ----------
  app.get('/api/health', (c) =>
    c.json({
      ok: true,
      storage: 'memory',
      uptimeMs: Date.now() - startedAt,
      startedAt: new Date(startedAt).toISOString(),
      // 顺带带上当前动态数，前端一眼确认服务状态，无需再拉一次列表（契约 4.1）
      posts: store.listPosts().length
    })
  )

  // ---------- 4.2 统计 ----------
  app.get('/api/stats', (c) => c.json(store.stats()))

  // ---------- 4.3 动态列表 ----------
  app.get('/api/posts', (c) => c.json({ posts: store.listPosts() }))

  // ---------- 4.4 发布 ----------
  app.post('/api/posts', async (c) => {
    const body = await readJsonBody(c)

    // 缺 text 视为「内容为空」（EMPTY），类型不对则由 store 判为 INVALID。
    // 注意用 === undefined 而非 ?? ：null 属于类型错误，不该被当成空串放过。
    const text = body.text === undefined ? '' : body.text
    const post = store.addPost(text)

    // 契约要求 201，且忽略客户端传入的 id（store 内部生成，不读 body.id）
    return c.json({ post }, 201)
  })

  // ---------- 4.7 合并导入 ----------
  // 必须注册在 /api/posts/:id 之前吗？不需要（方法不同），但放前面可读性更好。
  app.post('/api/posts/merge', async (c) => {
    const body = await readJsonBody(c)
    const { added, skipped } = store.mergePosts(body.posts)

    // 一并回传合并后的完整列表，前端可省一次 GET（契约 4.7）
    return c.json({ added, skipped, posts: store.listPosts() })
  })

  // ---------- 4.5 单条查询 ----------
  app.get('/api/posts/:id', (c) => {
    const post = store.getPost(c.req.param('id'))
    if (!post) {
      throw httpError(ERROR_CODES.NOT_FOUND, '动态不存在')
    }
    return c.json({ post })
  })

  // ---------- 4.6 删除单条 ----------
  app.delete('/api/posts/:id', (c) => {
    const removed = store.removePost(c.req.param('id'))
    if (!removed) {
      throw httpError(ERROR_CODES.NOT_FOUND, '动态不存在')
    }
    // 契约要求 204 且**无响应体**：c.body(null, 204)
    return c.body(null, 204)
  })

  // ---------- 4.13 切换互动状态（点赞 / 收藏） ----------
  app.post('/api/posts/:id/reactions/:kind', async (c) => {
    // 用可选 body 读取器：契约允许完全不带 body（此时按 toggle）
    const body = await readOptionalJsonBody(c)
    const action = parseReactionAction(body.action)

    // kind 的合法性交给 store 判定 —— 它同时要负责「id 不存在」的 NOT_FOUND，
    // 放在同一处才能保证「先校验哪一项」的顺序在两处实现里不会打架。
    const post = store.setReaction(c.req.param('id'), c.req.param('kind'), action)

    // 返回完整 Post，前端直接覆盖本地副本，省一次 GET（契约 4.13）
    return c.json({ post })
  })

  // ---------- 4.8 清空动态 ----------
  app.delete('/api/posts', (c) => {
    store.clearPosts()
    // 幂等：空仓库清空同样 204，前端不必先查再删
    return c.body(null, 204)
  })

  // ---------- 4.9 读取资料 ----------
  app.get('/api/profile', (c) => c.json({ profile: store.getProfile() }))

  // ---------- 4.10 更新资料 ----------
  app.put('/api/profile', async (c) => {
    const body = await readJsonBody(c)
    // body 里的 joinedAt 会被 store 忽略（契约 4.10：joinedAt 不可改）
    return c.json({ profile: store.updateProfile(body) })
  })

  // ---------- 4.11 从备份恢复资料 ----------
  app.post('/api/profile/restore', async (c) => {
    const body = await readJsonBody(c)
    if (body.profile === undefined) {
      throw httpError(ERROR_CODES.INVALID, '缺少 profile 字段')
    }
    // store 返回 { applied, profile }，与契约响应结构一致，直接透传
    return c.json(store.restoreProfile(body.profile))
  })

  // ---------- 4.12 重置资料 ----------
  app.post('/api/profile/reset', (c) => c.json({ profile: store.resetProfile() }))

  // ---------- 兜底：未知路由 ----------
  // 不这样做的话，Hono 默认返回纯文本 404，前端按 json 解析会二次报错。
  app.notFound((c) =>
    c.json({ error: { code: ERROR_CODES.NOT_FOUND, message: '接口不存在' } }, 404)
  )

  // ---------- 兜底：未预期的异常 ----------
  app.onError((err, c) => {
    const code = err?.code
    const status = STATUS_BY_CODE[code]

    if (status) {
      // 业务错误：message 是给用户看的，可以直接下发
      return c.json({ error: { code, message: err.message } }, status)
    }

    // 未知错误：只回固定文案，避免把堆栈/内部实现细节泄露给客户端。
    // 详细信息留给服务端日志（这里用 console.error 保证可排查）。
    console.error('[mini-feed] 未处理的异常:', err)
    return c.json({ error: { code: 'INTERNAL', message: '服务器内部错误' } }, 500)
  })

  return app
}

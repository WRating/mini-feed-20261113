/**
 * HTTP 客户端 —— 前端访问后端的唯一出口。
 *
 * 为什么要有这一层（而不是各 store 里直接 fetch）：
 *
 * 1. **解包集中在一处**：后端的响应为了可扩展都套了一层（`{posts}` / `{post}` /
 *    `{profile}`），如果每个 store 各自 `res.posts`，字段一改就要全仓搜索。
 *    这里统一解掉，store 拿到的永远是领域对象本身。
 *
 * 2. **错误必须结构化**：UI 需要按 `code` 决定文案（内容为空 / 太长 / 服务不可达），
 *    所以这里把所有失败（网络、超时、4xx、畸形响应）都收敛成同一种 `ApiError`，
 *    调用方永远只需判断 `error.code`，不用管底层是 fetch 抛的还是 HTTP 状态码。
 *
 * 3. **超时必须显式控制**：后端卡住时 `fetch` 不会自己超时，页面会一直转圈。
 *    用 `AbortController` 兜住，保证任何请求都有上限。
 *
 * 4. **工厂 + 依赖注入**：`createApiClient` 接收 `fetchImpl`，测试可注入 fake fetch
 *    而不必 mock 全局；`baseUrl` 默认取共享常量，避免前后端各写一份 `/api`。
 */
import { API_BASE, REACTION_ACTIONS } from '@shared/constants'

/** 默认超时：与天气服务的 8000ms 对齐，避免两处出现不同的「卡住」体验 */
const DEFAULT_TIMEOUT = 8000

/**
 * 统一的接口错误。
 *
 * `code` 是**给程序判断的**（可能来自后端业务码，也可能是客户端自造的网络码）；
 * `message` 是**给人看的**中文文案，可直接丢给 toast。
 */
export class ApiError extends Error {
  /**
   * @param {string} code 错误码（后端业务码，或 'NETWORK' / 'BAD_RESPONSE'）
   * @param {string} message 可读中文文案
   * @param {number} status HTTP 状态码；网络层失败时为 0
   */
  constructor(code, message, status = 0) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

/** 网络层失败：不可达、DNS 失败、超时（status 恒为 0，因为根本没拿到响应） */
function networkError(message) {
  return new ApiError('NETWORK', message, 0)
}

/**
 * 响应体不符合预期：不是合法 JSON、不是约定结构、解包字段缺失。
 * 这类错误通常意味着「前端和后端版本对不上」或「中间有代理返回了别的页面」，
 * 单独给一个码，便于与业务错误区分排查方向。
 */
function badResponse(status) {
  return new ApiError('BAD_RESPONSE', '服务端返回了无法识别的数据', status)
}

/** 是否为「普通对象」：排除 null / 数组 / 原始值 */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function createApiClient({
  baseUrl = API_BASE,
  // 刻意不设默认值：留到请求时再读 globalThis.fetch。
  // 这样「运行期 fetch 被替换/被删掉」也能被捕捉到，而不是在工厂阶段就固化。
  fetchImpl,
  timeout = DEFAULT_TIMEOUT
} = {}) {
  /** 去掉末尾斜杠，避免拼出 `//health` 这种路径（部分代理会 404） */
  const root = String(baseUrl).replace(/\/+$/, '')

  /** 惰性取 fetch：显式注入优先，其次全局 */
  function resolveFetch() {
    const impl = fetchImpl ?? globalThis.fetch
    if (typeof impl !== 'function') {
      throw networkError('当前环境不支持网络请求')
    }
    return impl
  }

  /**
   * 发一次请求并解出响应体。
   *
   * @param {string} path 相对 baseUrl 的路径
   * @param {{method?: string, body?: unknown}} [options]
   * @returns {Promise<unknown>} 已解析的 JSON；204 时返回 undefined
   */
  async function request(path, { method = 'GET', body } = {}) {
    const impl = resolveFetch()
    const controller = new AbortController()

    // 需要区分「超时」与「其他网络故障」：两者都表现为 fetch reject，
    // 只有这里记得住是定时器主动 abort 的。
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, timeout)

    const init = { method, signal: controller.signal }
    // GET / DELETE 不带 body：某些实现会因 GET 带 body 直接报错
    if (body !== undefined) {
      init.headers = { 'Content-Type': 'application/json; charset=utf-8' }
      init.body = JSON.stringify(body)
    }

    let response
    try {
      response = await impl(`${root}${path}`, init)
    } catch (cause) {
      throw networkError(timedOut ? '请求超时，请稍后重试' : '无法连接服务端')
    } finally {
      // 成功/失败都要清掉，否则 timer 会在请求结束后再 abort 一个已完成的请求
      clearTimeout(timer)
    }

    if (!response || typeof response.status !== 'number') {
      throw badResponse(0)
    }

    // 204 契约上无响应体：去调 json() 只会让实现尝到解析失败的苦果
    if (response.status === 204) return undefined

    if (!response.ok) throw await readError(response)

    return await readJson(response)
  }

  /** 读 2xx 响应体；不是合法 JSON 视为 BAD_RESPONSE */
  async function readJson(response) {
    try {
      const data = await response.json()
      if (!isPlainObject(data)) throw badResponse(response.status)
      return data
    } catch {
      throw badResponse(response.status)
    }
  }

  /**
   * 读非 2xx 响应体，按契约第 3 节透传后端的 `{ error: { code, message } }`。
   * 结构不符（例如代理返回 HTML）时退回 BAD_RESPONSE —— 此时后端的 code 不可信。
   *
   * 但 502/503/504 需要特别处理：开发期 Vite 代理在后端没启动时会返回自己的
   * HTML 错误页。若一律报「无法识别的数据」，用户会去排查代码而不是去启动服务，
   * 因此这里把它们归为「服务不可用」，直接给出可执行的指引。
   */
  async function readError(response) {
    let data = null
    try {
      data = await response.json()
    } catch {
      data = null
    }

    const error = isPlainObject(data) ? data.error : null
    if (isPlainObject(error) && typeof error.code === 'string') {
      return new ApiError(error.code, error.message || '请求失败', response.status)
    }

    // 网关类错误 + 非 JSON 响应 = 后端的"门"都没开（没启动 / 挂了 / 被代理拦下）
    if (response.status === 502 || response.status === 503 || response.status === 504) {
      return new ApiError(
        'UNAVAILABLE',
        '无法连接服务端，请确认后端已启动（npm run dev）',
        response.status
      )
    }

    return badResponse(response.status)
  }

  /**
   * 解包后端的外层包装。
   * 字段缺失时抛 BAD_RESPONSE：宁可报错，也不要把 undefined 当作数据继续往下传，
   * 否则错误会延迟到渲染层才爆，且现场全无线索。
   */
  function unwrap(data, key) {
    const value = data[key]
    if (value === undefined) throw badResponse(200)
    return value
  }

  return {
    /** 健康检查：{ ok, storage, uptimeMs, startedAt } */
    getHealth: () => request('/health'),

    /** 服务端统计：{ posts, chars, bytes } */
    getStats: () => request('/stats'),

    /** 动态列表；后端返回 {posts}，这里解包成数组给 store */
    async listPosts() {
      const data = await request('/posts')
      const posts = unwrap(data, 'posts')
      if (!Array.isArray(posts)) throw badResponse(200)
      return posts
    },

    /** 单条查询 */
    async getPost(id) {
      const data = await request(`/posts/${encodeURIComponent(id)}`)
      return unwrap(data, 'post')
    },

    /** 发布；text 原样交给服务端 trim 与校验（服务端是唯一权威） */
    async createPost(text) {
      const data = await request('/posts', { method: 'POST', body: { text } })
      return unwrap(data, 'post')
    },

    /** 删除单条；204 无体，返回 undefined */
    removePost: (id) => request(`/posts/${encodeURIComponent(id)}`, { method: 'DELETE' }),

    /**
     * 切换互动状态（点赞 / 收藏），返回更新后的完整 Post（已解包 `data.post`）。
     *
     * toggle 是契约里的**默认行为**，因此刻意不发送请求体：
     * - 少一次序列化，也少一个可能与后端默认值漂移的位置；
     * - 无 body 时不带 Content-Type，可避免不必要的预检请求。
     * 只有备份导入这种需要「幂等目标状态」的场景才显式传 action: add / remove。
     */
    async setReaction(id, kind, { action = REACTION_ACTIONS.TOGGLE } = {}) {
      const path = `/posts/${encodeURIComponent(id)}/reactions/${encodeURIComponent(kind)}`
      const isToggle = action === REACTION_ACTIONS.TOGGLE || action === undefined
      const data = await request(path, {
        method: 'POST',
        body: isToggle ? undefined : { action }
      })
      return unwrap(data, 'post')
    },

    /** 合并导入；一并拿到合并后的完整列表，前端可省一次 GET */
    mergePosts: (posts) => request('/posts/merge', { method: 'POST', body: { posts } }),

    /** 清空全部动态（保留资料）；204 无体 */
    clearPosts: () => request('/posts', { method: 'DELETE' }),

    /** 读取资料 */
    async getProfile() {
      const data = await request('/profile')
      return unwrap(data, 'profile')
    },

    /** 局部更新资料 */
    async updateProfile(patch) {
      const data = await request('/profile', { method: 'PUT', body: patch })
      return unwrap(data, 'profile')
    },

    /** 从备份恢复资料；返回 { applied, profile }，由调用方判断是否生效 */
    restoreProfile: (profile) =>
      request('/profile/restore', { method: 'POST', body: { profile } }),

    /** 重置资料 */
    async resetProfile() {
      const data = await request('/profile/reset', { method: 'POST' })
      return unwrap(data, 'profile')
    }
  }
}

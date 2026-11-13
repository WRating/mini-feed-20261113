/**
 * API 客户端测试（TDD）
 *
 * 关注点：
 * - 每个方法的「成功路径」都把后端的外层包装解掉（{posts} / {post} / {profile}），
 *   让 store 拿到的是干净的领域对象；
 * - 失败路径必须收敛成统一的 ApiError（code / status / message），
 *   这样 UI 只需要看 code 就能决定提示文案；
 * - 204 无响应体，**不能**去解析 JSON。
 *
 * 全部用注入的 fake fetch，不联网、不依赖 happy-dom 的 fetch 实现。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createApiClient, ApiError } from './api-client'
import { API_BASE, ERROR_CODES } from '@shared/constants'

const BASE = 'http://test.local/api'

/** 造一个「成功」响应：ok 为 true 时 status 默认 200 */
function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn(async () => payload),
    text: vi.fn(async () => JSON.stringify(payload))
  }
}

/** 造一个 204 响应：json() 一旦被调用就说明实现有 bug */
function noContentResponse() {
  return {
    ok: true,
    status: 204,
    json: vi.fn(async () => {
      throw new Error('204 不应该解析 JSON')
    }),
    text: vi.fn(async () => '')
  }
}

/** 造一个「后端业务错误」响应 */
function errorResponse(status, code, message) {
  return {
    ok: false,
    status,
    json: vi.fn(async () => ({ error: { code, message } })),
    text: vi.fn(async () => JSON.stringify({ error: { code, message } }))
  }
}

/** 取 fake fetch 的第 n 次调用的参数，读起来更直观 */
function callOf(fetchImpl, n = 0) {
  return fetchImpl.mock.calls[n]
}

let fetchImpl
let client

beforeEach(() => {
  fetchImpl = vi.fn()
  client = createApiClient({ baseUrl: BASE, fetchImpl })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('api-client · 构造与默认值', () => {
  it('默认 baseUrl 取共享常量 API_BASE', async () => {
    const spy = vi.fn(async () => jsonResponse({ ok: true }))
    await createApiClient({ fetchImpl: spy }).getHealth()
    expect(callOf(spy)[0]).toBe(`${API_BASE}/health`)
  })

  it('baseUrl 末尾有斜杠时不会拼出双斜杠', async () => {
    const spy = vi.fn(async () => jsonResponse({ ok: true }))
    await createApiClient({ baseUrl: 'http://test.local/api/', fetchImpl: spy }).getHealth()
    expect(callOf(spy)[0]).toBe('http://test.local/api/health')
  })

  it('未注入 fetchImpl 时回退到 globalThis.fetch', async () => {
    const original = globalThis.fetch
    const spy = vi.fn(async () => jsonResponse({ ok: true }))
    globalThis.fetch = spy
    try {
      await createApiClient({ baseUrl: BASE }).getHealth()
      expect(spy).toHaveBeenCalled()
    } finally {
      globalThis.fetch = original
    }
  })
})

describe('api-client · 健康检查与统计', () => {
  it('getHealth 直接返回响应体', async () => {
    const body = {
      ok: true,
      storage: 'memory',
      uptimeMs: 1234,
      startedAt: '2026-11-13T07:00:00.000Z'
    }
    fetchImpl.mockResolvedValueOnce(jsonResponse(body))

    await expect(client.getHealth()).resolves.toEqual(body)
    expect(callOf(fetchImpl)[0]).toBe(`${BASE}/health`)
    expect(callOf(fetchImpl)[1].method).toBe('GET')
  })

  it('getStats 直接返回响应体', async () => {
    fetchImpl.mockResolvedValueOnce(jsonResponse({ posts: 3, chars: 42, bytes: 812 }))
    await expect(client.getStats()).resolves.toEqual({ posts: 3, chars: 42, bytes: 812 })
    expect(callOf(fetchImpl)[0]).toBe(`${BASE}/stats`)
  })
})

describe('api-client · 动态', () => {
  const POST = { id: 'p1', text: '你好', createdAt: 1794534951738 }

  it('listPosts 解包 {posts} 并返回数组', async () => {
    fetchImpl.mockResolvedValueOnce(jsonResponse({ posts: [POST] }))
    const result = await client.listPosts()

    expect(Array.isArray(result)).toBe(true)
    expect(result).toEqual([POST])
    expect(callOf(fetchImpl)[0]).toBe(`${BASE}/posts`)
  })

  it('listPosts 空列表返回空数组', async () => {
    fetchImpl.mockResolvedValueOnce(jsonResponse({ posts: [] }))
    await expect(client.listPosts()).resolves.toEqual([])
  })

  it('getPost 解包 {post}', async () => {
    fetchImpl.mockResolvedValueOnce(jsonResponse({ post: POST }))
    await expect(client.getPost('p1')).resolves.toEqual(POST)
    expect(callOf(fetchImpl)[0]).toBe(`${BASE}/posts/p1`)
  })

  it('getPost 对 id 做 URL 编码（避免特殊字符破坏路径）', async () => {
    fetchImpl.mockResolvedValueOnce(jsonResponse({ post: POST }))
    await client.getPost('a/b?c')
    expect(callOf(fetchImpl)[0]).toBe(`${BASE}/posts/${encodeURIComponent('a/b?c')}`)
  })

  it('createPost 用 POST 发送 {text} 并解包 {post}', async () => {
    fetchImpl.mockResolvedValueOnce(jsonResponse({ post: POST }, 201))
    const result = await client.createPost('  你好  ')

    expect(result).toEqual(POST)
    const [url, init] = callOf(fetchImpl)
    expect(url).toBe(`${BASE}/posts`)
    expect(init.method).toBe('POST')
    // 服务端负责 trim，客户端原样发出去即可（契约 4.4）
    expect(JSON.parse(init.body)).toEqual({ text: '  你好  ' })
    expect(init.headers['Content-Type']).toContain('application/json')
  })

  it('removePost 处理 204：返回 undefined 且不解析 JSON', async () => {
    const response = noContentResponse()
    fetchImpl.mockResolvedValueOnce(response)

    await expect(client.removePost('p1')).resolves.toBeUndefined()
    expect(response.json).not.toHaveBeenCalled()
    expect(callOf(fetchImpl)[1].method).toBe('DELETE')
    expect(callOf(fetchImpl)[0]).toBe(`${BASE}/posts/p1`)
  })

  it('mergePosts 用 POST 发送 {posts} 并透传结果', async () => {
    fetchImpl.mockResolvedValueOnce(
      jsonResponse({ added: 2, skipped: 1, posts: [POST] })
    )
    const result = await client.mergePosts([POST])

    expect(result).toEqual({ added: 2, skipped: 1, posts: [POST] })
    const [url, init] = callOf(fetchImpl)
    expect(url).toBe(`${BASE}/posts/merge`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ posts: [POST] })
  })

  it('clearPosts 处理 204：返回 undefined 且不解析 JSON', async () => {
    const response = noContentResponse()
    fetchImpl.mockResolvedValueOnce(response)

    await expect(client.clearPosts()).resolves.toBeUndefined()
    expect(response.json).not.toHaveBeenCalled()
    expect(callOf(fetchImpl)[1].method).toBe('DELETE')
    expect(callOf(fetchImpl)[0]).toBe(`${BASE}/posts`)
  })
})

describe('api-client · 互动（点赞 / 收藏）', () => {
  const POST = {
    id: 'p1',
    text: '你好',
    createdAt: 1,
    likes: 1,
    favorites: 0,
    liked: true,
    favorited: false
  }

  it('setReaction 用 POST 到 /posts/:id/reactions/:kind 并解包 {post}', async () => {
    fetchImpl.mockResolvedValueOnce(jsonResponse({ post: POST }))
    const result = await client.setReaction('p1', 'like')

    expect(result).toEqual(POST)
    const [url, init] = callOf(fetchImpl)
    expect(url).toBe(`${BASE}/posts/p1/reactions/like`)
    expect(init.method).toBe('POST')
  })

  it('action 为 toggle 时不发送请求体（契约里 toggle 是默认行为）', async () => {
    fetchImpl.mockResolvedValueOnce(jsonResponse({ post: POST }))
    await client.setReaction('p1', 'like', { action: 'toggle' })

    const [, init] = callOf(fetchImpl)
    expect(init.body).toBeUndefined()
    // 没有 body 就不该带 Content-Type，避免触发预检请求
    expect(init.headers).toBeUndefined()
  })

  it('缺省 options 同样不带请求体', async () => {
    fetchImpl.mockResolvedValueOnce(jsonResponse({ post: POST }))
    await client.setReaction('p1', 'favorite')

    const [, init] = callOf(fetchImpl)
    expect(init.body).toBeUndefined()
    expect(callOf(fetchImpl)[0]).toBe(`${BASE}/posts/p1/reactions/favorite`)
  })

  it('action 为 add / remove 时把目标状态放进请求体（备份导入要幂等）', async () => {
    const actions = ['add', 'remove']
    for (const action of actions) {
      fetchImpl.mockResolvedValueOnce(jsonResponse({ post: POST }))
    }

    for (const action of actions) {
      await client.setReaction('p1', 'like', { action })
    }

    actions.forEach((action, i) => {
      const [url, init] = callOf(fetchImpl, i)
      expect(url).toBe(`${BASE}/posts/p1/reactions/like`)
      expect(JSON.parse(init.body)).toEqual({ action })
      expect(init.headers['Content-Type']).toContain('application/json')
    })
  })

  it('对 id 与 kind 做 URL 编码（避免特殊字符破坏路径）', async () => {
    fetchImpl.mockResolvedValueOnce(jsonResponse({ post: POST }))
    await client.setReaction('a/b?c', 'like')
    expect(callOf(fetchImpl)[0]).toBe(`${BASE}/posts/${encodeURIComponent('a/b?c')}/reactions/like`)
  })

  it('404 透传 NOT_FOUND（动态被别的标签页删掉了）', async () => {
    fetchImpl.mockResolvedValueOnce(errorResponse(404, ERROR_CODES.NOT_FOUND, '动态不存在'))
    const error = await client.setReaction('nope', 'like').catch((e) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error.code).toBe(ERROR_CODES.NOT_FOUND)
    expect(error.status).toBe(404)
  })

  it('网络失败归为 NETWORK，不把 undefined 当数据往下传', async () => {
    fetchImpl.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const error = await client.setReaction('p1', 'like').catch((e) => e)
    expect(error.code).toBe('NETWORK')
  })

  it('2xx 但缺 post 字段时归为 BAD_RESPONSE', async () => {
    fetchImpl.mockResolvedValueOnce(jsonResponse({ ok: true }))
    const error = await client.setReaction('p1', 'like').catch((e) => e)
    expect(error.code).toBe('BAD_RESPONSE')
  })
})

describe('api-client · 个人资料', () => {
  const PROFILE = { name: '我', bio: '这个人很懒，什么都没写。', avatar: '🙂', joinedAt: 1 }

  it('getProfile 解包 {profile}', async () => {
    fetchImpl.mockResolvedValueOnce(jsonResponse({ profile: PROFILE }))
    await expect(client.getProfile()).resolves.toEqual(PROFILE)
    expect(callOf(fetchImpl)[0]).toBe(`${BASE}/profile`)
  })

  it('updateProfile 用 PUT 发送补丁并解包 {profile}', async () => {
    fetchImpl.mockResolvedValueOnce(jsonResponse({ profile: { ...PROFILE, name: '阿铁' } }))
    const result = await client.updateProfile({ name: '阿铁' })

    expect(result.name).toBe('阿铁')
    const [url, init] = callOf(fetchImpl)
    expect(url).toBe(`${BASE}/profile`)
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body)).toEqual({ name: '阿铁' })
  })

  it('restoreProfile 用 POST 发送 {profile} 并透传 {applied, profile}', async () => {
    fetchImpl.mockResolvedValueOnce(jsonResponse({ applied: true, profile: PROFILE }))
    const result = await client.restoreProfile({ name: '备份用户' })

    expect(result).toEqual({ applied: true, profile: PROFILE })
    const [url, init] = callOf(fetchImpl)
    expect(url).toBe(`${BASE}/profile/restore`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ profile: { name: '备份用户' } })
  })

  it('resetProfile 用 POST 且无请求体，解包 {profile}', async () => {
    fetchImpl.mockResolvedValueOnce(jsonResponse({ profile: PROFILE }))
    await expect(client.resetProfile()).resolves.toEqual(PROFILE)

    const [url, init] = callOf(fetchImpl)
    expect(url).toBe(`${BASE}/profile/reset`)
    expect(init.method).toBe('POST')
    expect(init.body).toBeUndefined()
  })
})

describe('api-client · 错误处理', () => {
  it('网络不可达时抛 NETWORK 且 status 为 0，message 为可读中文', async () => {
    fetchImpl.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    const error = await client.listPosts().catch((e) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toBeInstanceOf(Error)
    expect(error.code).toBe('NETWORK')
    expect(error.status).toBe(0)
    expect(error.message).toBe('无法连接服务端')
  })

  it('DNS / 连接被拒绝等底层错误同样归为 NETWORK', async () => {
    fetchImpl.mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND'))

    const error = await client.getStats().catch((e) => e)
    expect(error.code).toBe('NETWORK')
    expect(error.status).toBe(0)
  })

  it('请求超时抛 NETWORK（用 AbortController 中断）', async () => {
    vi.useFakeTimers()

    // 永不 resolve 的 fetch：只有 abort 能结束它，模拟后端卡住
    fetchImpl.mockImplementationOnce(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error('aborted')))
        })
    )

    const pending = client.getHealth().catch((e) => e)
    await vi.advanceTimersByTimeAsync(8000)
    const error = await pending

    expect(error.code).toBe('NETWORK')
    expect(error.status).toBe(0)
    expect(error.message).toBe('请求超时，请稍后重试')
  })

  it('超时时间可由参数覆盖', async () => {
    vi.useFakeTimers()
    const fast = createApiClient({ baseUrl: BASE, fetchImpl, timeout: 100 })
    fetchImpl.mockImplementationOnce(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error('aborted')))
        })
    )

    const pending = fast.getHealth().catch((e) => e)
    await vi.advanceTimersByTimeAsync(100)
    expect((await pending).code).toBe('NETWORK')
  })

  it('4xx 时把后端 error.code / message 透传到 ApiError', async () => {
    fetchImpl.mockResolvedValueOnce(
      errorResponse(400, ERROR_CODES.TOO_LONG, '内容不能超过 280 字')
    )

    const error = await client.createPost('x'.repeat(300)).catch((e) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error.code).toBe(ERROR_CODES.TOO_LONG)
    expect(error.status).toBe(400)
    expect(error.message).toBe('内容不能超过 280 字')
  })

  it('404 透传 NOT_FOUND', async () => {
    fetchImpl.mockResolvedValueOnce(errorResponse(404, ERROR_CODES.NOT_FOUND, '动态不存在'))

    const error = await client.getPost('nope').catch((e) => e)
    expect(error.code).toBe(ERROR_CODES.NOT_FOUND)
    expect(error.status).toBe(404)
  })

  it('502 + HTML 响应体归为 UNAVAILABLE（后端没启动，而不是数据格式问题）', async () => {
    // 真实场景：开发期后端没起来时，Vite 代理会返回自己的 HTML 错误页。
    // 若报成「无法识别的数据」，用户会去排查代码而不是去启动服务，属于误导。
    fetchImpl.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: vi.fn(async () => {
        throw new SyntaxError('Unexpected token <')
      }),
      text: vi.fn(async () => '<html>Bad Gateway</html>')
    })

    const error = await client.getHealth().catch((e) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error.code).toBe('UNAVAILABLE')
    expect(error.status).toBe(502)
    // 文案必须给出可执行的下一步，而不是只说"失败了"
    expect(error.message).toContain('npm run dev')
  })

  it('503 与 504 同样归为 UNAVAILABLE', async () => {
    for (const status of [503, 504]) {
      fetchImpl.mockResolvedValueOnce({
        ok: false,
        status,
        json: vi.fn(async () => {
          throw new SyntaxError('not json')
        })
      })
      const error = await client.getHealth().catch((e) => e)
      expect(error.code).toBe('UNAVAILABLE')
      expect(error.status).toBe(status)
    }
  })

  it('后端返回了结构化错误时优先透传其 code（不被 UNAVAILABLE 覆盖）', async () => {
    // 后端活着但主动返回 503 时，它自己的 code 更有信息量，不该被网关判定盖掉
    fetchImpl.mockResolvedValueOnce(
      jsonResponse({ error: { code: 'MAINTENANCE', message: '维护中' } }, 503)
    )

    const error = await client.getHealth().catch((e) => e)
    expect(error.code).toBe('MAINTENANCE')
    expect(error.message).toBe('维护中')
  })

  it('4xx + HTML 响应体仍归为 BAD_RESPONSE（不是网关错误）', async () => {
    fetchImpl.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: vi.fn(async () => {
        throw new SyntaxError('not json')
      })
    })

    const error = await client.getHealth().catch((e) => e)
    expect(error.code).toBe('BAD_RESPONSE')
    expect(error.status).toBe(400)
  })

  it('4xx 是合法 JSON 但缺少 error 字段时归为 BAD_RESPONSE', async () => {
    fetchImpl.mockResolvedValueOnce(jsonResponse({ message: 'oops' }, 400))

    const error = await client.listPosts().catch((e) => e)
    expect(error.code).toBe('BAD_RESPONSE')
    expect(error.status).toBe(400)
  })

  it('2xx 但响应体不是合法 JSON 时归为 BAD_RESPONSE', async () => {
    fetchImpl.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn(async () => {
        throw new SyntaxError('Unexpected token o')
      }),
      text: vi.fn(async () => 'not json')
    })

    const error = await client.getStats().catch((e) => e)
    expect(error.code).toBe('BAD_RESPONSE')
    expect(error.status).toBe(200)
  })

  it('2xx 但解包字段缺失时归为 BAD_RESPONSE（不能把 undefined 当数据往下传）', async () => {
    fetchImpl.mockResolvedValueOnce(jsonResponse({ items: [] }))

    const error = await client.listPosts().catch((e) => e)
    expect(error.code).toBe('BAD_RESPONSE')
  })

  it('fetchImpl 不存在时立刻抛 NETWORK，而不是 TypeError', async () => {
    const broken = createApiClient({ baseUrl: BASE, fetchImpl: undefined })
    const original = globalThis.fetch
    globalThis.fetch = undefined
    try {
      const error = await broken.getHealth().catch((e) => e)
      expect(error).toBeInstanceOf(ApiError)
      expect(error.code).toBe('NETWORK')
    } finally {
      globalThis.fetch = original
    }
  })
})

describe('api-client · 请求细节', () => {
  it('GET 请求不携带 body', async () => {
    fetchImpl.mockResolvedValueOnce(jsonResponse({ posts: [] }))
    await client.listPosts()
    expect(callOf(fetchImpl)[1].body).toBeUndefined()
  })

  it('请求结束后清理超时定时器（不留悬挂 timer）', async () => {
    vi.useFakeTimers()
    fetchImpl.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await client.getHealth()
    // 若定时器未清理，advanceTimers 之后会触发 abort，这里以「无残留任务」间接断言
    expect(vi.getTimerCount()).toBe(0)
  })
})

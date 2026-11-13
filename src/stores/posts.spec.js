/**
 * posts store 测试（TDD）
 *
 * 关注点：
 * - 数据的唯一来源是**服务端**，store 只做「调用 → 落到本地状态」的搬运；
 * - 所有写操作都是异步的（HTTP），因此必须覆盖「失败时不破坏本地列表」；
 * - 加载失败要留下 loadError 供 UI 展示重试，而不是让页面白屏。
 *
 * 依赖注入沿用项目既有的「工厂注入」：setPostsApiFactory(() => fake)，
 * 而不是 usePostsStore(api) —— Pinia 会把第一个参数当成 pinia 实例，会直接崩。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import {
  usePostsStore,
  setPostsApiFactory,
  resetPostsApiFactory
} from './posts'
import { ApiError } from '@/services/api-client'
import { MAX_LEN } from '@/utils/post'

const NOW = new Date(2026, 10, 13, 10, 0, 0).getTime()

const POST_A = { id: 'a', text: '旧的一条', createdAt: NOW - 1000 }
const POST_B = { id: 'b', text: '新的一条', createdAt: NOW }

/** 造一个可控的 api-client 替身：默认全部成功 */
function fakeApi(overrides = {}) {
  return {
    listPosts: vi.fn(async () => [POST_B, POST_A]),
    createPost: vi.fn(async (text) => ({
      id: 'server-1',
      text: String(text).trim(),
      createdAt: NOW
    })),
    removePost: vi.fn(async () => undefined),
    mergePosts: vi.fn(async (posts) => ({
      added: posts.length,
      skipped: 0,
      posts: [...posts, POST_B, POST_A]
    })),
    clearPosts: vi.fn(async () => undefined),
    ...overrides
  }
}

/** 注入替身再创建 store（顺序不能反：store 初始化时会取一次工厂） */
function storeWith(api) {
  setPostsApiFactory(() => api)
  return usePostsStore()
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  resetPostsApiFactory()
})

describe('posts store · 初始状态', () => {
  it('未加载时列表为空，loaded 为 false', () => {
    const store = storeWith(fakeApi())
    expect(store.posts).toEqual([])
    expect(store.count).toBe(0)
    expect(store.isEmpty).toBe(true)
    expect(store.loaded).toBe(false)
    expect(store.loading).toBe(false)
    expect(store.loadError).toBeNull()
  })

  it('创建 store 不会自动发请求（由 App 决定何时 load）', () => {
    const api = fakeApi()
    storeWith(api)
    expect(api.listPosts).not.toHaveBeenCalled()
  })
})

describe('posts store · load', () => {
  it('加载成功后填充列表并置 loaded', async () => {
    const store = storeWith(fakeApi())
    await store.load()

    expect(store.posts.map((p) => p.id)).toEqual(['b', 'a'])
    expect(store.count).toBe(2)
    expect(store.isEmpty).toBe(false)
    expect(store.loaded).toBe(true)
    expect(store.loadError).toBeNull()
  })

  it('服务端返回乱序时按时间倒序整理', async () => {
    const api = fakeApi({ listPosts: vi.fn(async () => [POST_A, POST_B]) })
    const store = storeWith(api)
    await store.load()
    expect(store.posts.map((p) => p.id)).toEqual(['b', 'a'])
  })

  it('加载过程中 loading 为 true', async () => {
    let release
    const gate = new Promise((resolve) => {
      release = resolve
    })
    const api = fakeApi({
      listPosts: vi.fn(async () => {
        await gate
        return [POST_B]
      })
    })
    const store = storeWith(api)

    const pending = store.load()
    expect(store.loading).toBe(true)

    release()
    await pending
    expect(store.loading).toBe(false)
  })

  it('列表为空时 loaded 仍为 true（空列表是合法状态）', async () => {
    const api = fakeApi({ listPosts: vi.fn(async () => []) })
    const store = storeWith(api)
    await store.load()

    expect(store.isEmpty).toBe(true)
    expect(store.loaded).toBe(true)
  })

  it('服务端混入非法条目时只保留合法的（防脏数据）', async () => {
    const api = fakeApi({
      listPosts: vi.fn(async () => [POST_B, { text: 123, createdAt: 1 }, null, POST_A])
    })
    const store = storeWith(api)
    await store.load()
    expect(store.posts.map((p) => p.id)).toEqual(['b', 'a'])
  })

  it('网络失败时置 loadError 且不抛错，loaded 保持 false 以便重试', async () => {
    const api = fakeApi({
      listPosts: vi.fn(async () => {
        throw new ApiError('NETWORK', '无法连接服务端', 0)
      })
    })
    const store = storeWith(api)

    await expect(store.load()).resolves.toBeUndefined()
    expect(store.loadError).toBe('无法连接服务端')
    expect(store.loaded).toBe(false)
    expect(store.loading).toBe(false)
    expect(store.posts).toEqual([])
  })

  it('失败后重试成功会清掉 loadError', async () => {
    const listPosts = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('NETWORK', '无法连接服务端', 0))
      .mockResolvedValueOnce([POST_B])
    const store = storeWith(fakeApi({ listPosts }))

    await store.load()
    expect(store.loadError).toBeTruthy()

    await store.load()
    expect(store.loadError).toBeNull()
    expect(store.loaded).toBe(true)
    expect(store.count).toBe(1)
  })

  it('重复 load 会用服务端结果整体覆盖本地列表', async () => {
    const listPosts = vi
      .fn()
      .mockResolvedValueOnce([POST_A, POST_B])
      .mockResolvedValueOnce([POST_A])
    const store = storeWith(fakeApi({ listPosts }))

    await store.load()
    await store.load()
    expect(store.posts.map((p) => p.id)).toEqual(['a'])
  })
})

describe('posts store · publish', () => {
  it('发布成功后写入列表头部，并记录 lastPublishedId', async () => {
    const api = fakeApi()
    const store = storeWith(api)
    await store.load()

    const result = await store.publish('  新动态  ')

    expect(result.ok).toBe(true)
    expect(result.post.id).toBe('server-1')
    expect(store.posts[0].id).toBe('server-1')
    expect(store.lastPublishedId).toBe('server-1')
    expect(store.count).toBe(3)
  })

  it('原样把文本交给服务端 trim（服务端是校验唯一权威）', async () => {
    const api = fakeApi()
    const store = storeWith(api)
    await store.publish('  带空白  ')
    expect(api.createPost).toHaveBeenCalledWith('  带空白  ')
  })

  it('空内容被本地拦下，不发请求', async () => {
    const api = fakeApi()
    const store = storeWith(api)

    expect((await store.publish('')).ok).toBe(false)
    expect((await store.publish('   ')).ok).toBe(false)
    expect(api.createPost).not.toHaveBeenCalled()
    expect(store.count).toBe(0)
  })

  it('超长内容被本地拦下并给出 280 提示，不发请求', async () => {
    const api = fakeApi()
    const store = storeWith(api)

    const result = await store.publish('a'.repeat(MAX_LEN + 1))
    expect(result.ok).toBe(false)
    expect(result.error).toContain('280')
    expect(api.createPost).not.toHaveBeenCalled()
  })

  it('恰好 280 字可以发布', async () => {
    const api = fakeApi()
    const store = storeWith(api)
    expect((await store.publish('a'.repeat(MAX_LEN))).ok).toBe(true)
  })

  it('非字符串入参被拒绝且不发请求', async () => {
    const api = fakeApi()
    const store = storeWith(api)
    expect((await store.publish(null)).ok).toBe(false)
    expect(api.createPost).not.toHaveBeenCalled()
  })

  it('服务端拒绝（TOO_LONG）时透传后端文案且不改动列表', async () => {
    const api = fakeApi({
      createPost: vi.fn(async () => {
        throw new ApiError('TOO_LONG', '内容不能超过 280 字', 400)
      })
    })
    const store = storeWith(api)
    await store.load()
    const before = store.posts.length

    const result = await store.publish('会失败的内容')

    expect(result.ok).toBe(false)
    expect(result.error).toBe('内容不能超过 280 字')
    expect(store.posts).toHaveLength(before)
  })

  it('网络失败时返回可读错误且不改动列表（内容不丢在 UI 侧）', async () => {
    const api = fakeApi({
      createPost: vi.fn(async () => {
        throw new ApiError('NETWORK', '无法连接服务端', 0)
      })
    })
    const store = storeWith(api)
    await store.load()

    const result = await store.publish('弱网下的内容')

    expect(result.ok).toBe(false)
    expect(result.error).toBe('无法连接服务端')
    expect(store.count).toBe(2)
  })

  it('未 load 时发布也能成功（列表初始为空）', async () => {
    const store = storeWith(fakeApi())
    const result = await store.publish('第一条')
    expect(result.ok).toBe(true)
    expect(store.count).toBe(1)
  })
})

describe('posts store · remove', () => {
  it('删除成功后从列表移除并返回 true', async () => {
    const api = fakeApi()
    const store = storeWith(api)
    await store.load()

    await expect(store.remove('b')).resolves.toBe(true)
    expect(store.posts.map((p) => p.id)).toEqual(['a'])
    expect(api.removePost).toHaveBeenCalledWith('b')
  })

  it('本地不存在该 id 时返回 false，且不发请求', async () => {
    const api = fakeApi()
    const store = storeWith(api)
    await store.load()

    await expect(store.remove('not-exist')).resolves.toBe(false)
    expect(api.removePost).not.toHaveBeenCalled()
    expect(store.count).toBe(2)
  })

  it('服务端 404 时返回 false 并置 loadError', async () => {
    const api = fakeApi({
      removePost: vi.fn(async () => {
        throw new ApiError('NOT_FOUND', '动态不存在', 404)
      })
    })
    const store = storeWith(api)
    await store.load()

    await expect(store.remove('b')).resolves.toBe(false)
    expect(store.loadError).toBe('动态不存在')
    expect(store.count).toBe(2)
  })

  it('网络失败时返回 false 且列表不变', async () => {
    const api = fakeApi({
      removePost: vi.fn(async () => {
        throw new ApiError('NETWORK', '无法连接服务端', 0)
      })
    })
    const store = storeWith(api)
    await store.load()

    await expect(store.remove('a')).resolves.toBe(false)
    expect(store.count).toBe(2)
  })

  it('删除 lastPublishedId 指向的动态时清空高亮', async () => {
    const store = storeWith(fakeApi())
    const { post } = await store.publish('高亮我')
    expect(store.lastPublishedId).toBe(post.id)

    await store.remove(post.id)
    expect(store.lastPublishedId).toBeNull()
  })
})

describe('posts store · merge', () => {
  it('以服务端返回的完整列表替换本地状态', async () => {
    const api = fakeApi()
    const store = storeWith(api)
    await store.load()

    const result = await store.merge([{ id: 'x', text: '导入的', createdAt: NOW + 5000 }])

    expect(result).toEqual({ added: 1, skipped: 0 })
    expect(store.posts[0].id).toBe('x')
    expect(store.count).toBe(3)
  })

  it('去重与非法条目的统计交给服务端，结果原样透传', async () => {
    const api = fakeApi({
      mergePosts: vi.fn(async () => ({ added: 1, skipped: 2, posts: [POST_B] }))
    })
    const store = storeWith(api)

    await expect(store.merge([{}, null, POST_B])).resolves.toEqual({ added: 1, skipped: 2 })
    expect(store.posts.map((p) => p.id)).toEqual(['b'])
  })

  it('空数组不发请求并返回全 0', async () => {
    const api = fakeApi()
    const store = storeWith(api)

    await expect(store.merge([])).resolves.toEqual({ added: 0, skipped: 0 })
    expect(api.mergePosts).not.toHaveBeenCalled()
  })

  it('非数组入参不报错也不发请求', async () => {
    const api = fakeApi()
    const store = storeWith(api)

    await expect(store.merge(null)).resolves.toEqual({ added: 0, skipped: 0 })
    await expect(store.merge('x')).resolves.toEqual({ added: 0, skipped: 0 })
    expect(api.mergePosts).not.toHaveBeenCalled()
  })

  it('服务端失败时返回全 0 并置 loadError，不抛错', async () => {
    const api = fakeApi({
      mergePosts: vi.fn(async () => {
        throw new ApiError('NETWORK', '无法连接服务端', 0)
      })
    })
    const store = storeWith(api)

    await expect(store.merge([POST_A])).resolves.toEqual({ added: 0, skipped: 0 })
    expect(store.loadError).toBe('无法连接服务端')
  })
})

describe('posts store · clear', () => {
  it('清空成功后列表为空且高亮复位', async () => {
    const api = fakeApi()
    const store = storeWith(api)
    await store.load()

    await store.clear()

    expect(store.posts).toEqual([])
    expect(store.lastPublishedId).toBeNull()
    expect(api.clearPosts).toHaveBeenCalled()
  })

  it('服务端失败时保留本地列表并置 loadError', async () => {
    const api = fakeApi({
      clearPosts: vi.fn(async () => {
        throw new ApiError('NETWORK', '无法连接服务端', 0)
      })
    })
    const store = storeWith(api)
    await store.load()

    await store.clear()

    expect(store.count).toBe(2)
    expect(store.loadError).toBe('无法连接服务端')
  })
})

describe('posts store · 查询与统计', () => {
  it('getById 命中返回动态，未命中返回 undefined', async () => {
    const store = storeWith(fakeApi())
    await store.load()

    expect(store.getById('b').text).toBe('新的一条')
    expect(store.getById('nope')).toBeUndefined()
  })

  it('totalChars 统计所有动态的字符数', async () => {
    const store = storeWith(fakeApi())
    await store.load()
    // '旧的一条' 4 字 + '新的一条' 4 字
    expect(store.totalChars).toBe(8)
  })

  it('列表为空时 totalChars 为 0', () => {
    expect(storeWith(fakeApi()).totalChars).toBe(0)
  })
})

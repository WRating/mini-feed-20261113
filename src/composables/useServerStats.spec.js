/**
 * 服务端数据统计 composable 测试（TDD）
 *
 * 前身是 useStorageMeter（浏览器 LocalStorage 占用 / 5MB 配额）。
 * 后端化后那套语义整体失效：数据在服务端内存里，没有配额，也没有「被浏览器禁用」这回事。
 * 仍然有价值的是「用户一共存了多少东西」这一信息，来源改为 GET /api/stats。
 *
 * 关键约定：
 * - 字节数由服务端算好（前端拿不到 Buffer），这里只负责取回来并格式化
 * - 请求失败不能抛错，也不能把 stats 显示成 0 —— 那会和「真的没有数据」混淆，
 *   因此用 available=false 让 UI 隐藏这一行
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { useServerStats, setStatsApiFactory, resetStatsApiFactory } from './useServerStats'

/** 用最小宿主组件挂载 composable */
function withSetup(composable) {
  let result
  const wrapper = mount(
    defineComponent({
      setup() {
        result = composable()
        return () => h('div')
      }
    })
  )
  return { result, wrapper }
}

/** 造一个可控的 api 替身 */
function fakeApi(overrides = {}) {
  return {
    getStats: vi.fn(async () => ({ posts: 3, chars: 42, bytes: 812, likes: 7, favorites: 2 })),
    ...overrides
  }
}

afterEach(() => {
  resetStatsApiFactory()
})

describe('useServerStats · 成功路径', () => {
  it('初始为不可用状态，避免首屏显示「0 条」误导用户', () => {
    setStatsApiFactory(() => fakeApi())
    const { result, wrapper } = withSetup(() => useServerStats())

    expect(result.available.value).toBe(false)
    expect(result.posts.value).toBe(0)
    wrapper.unmount()
  })

  it('refresh 后填充服务端数据', async () => {
    setStatsApiFactory(() => fakeApi())
    const { result, wrapper } = withSetup(() => useServerStats())

    await result.refresh()

    expect(result.available.value).toBe(true)
    expect(result.posts.value).toBe(3)
    expect(result.chars.value).toBe(42)
    expect(result.bytes.value).toBe(812)
    wrapper.unmount()
  })

  it('把字节数格式化为可读文案', async () => {
    setStatsApiFactory(() => fakeApi({ getStats: vi.fn(async () => ({ posts: 1, chars: 5, bytes: 812 })) }))
    const { result, wrapper } = withSetup(() => useServerStats())

    await result.refresh()
    expect(result.formatted.value).toBe('812 B')
    wrapper.unmount()
  })

  it('KB 级数据格式化正确', async () => {
    setStatsApiFactory(() =>
      fakeApi({ getStats: vi.fn(async () => ({ posts: 1, chars: 5, bytes: 2048 })) })
    )
    const { result, wrapper } = withSetup(() => useServerStats())

    await result.refresh()
    expect(result.formatted.value).toBe('2.0 KB')
    wrapper.unmount()
  })

  it('暴露可直接交给 DataManager 的普通值对象（避免 ref 嵌套不解包）', async () => {
    setStatsApiFactory(() => fakeApi())
    const { result, wrapper } = withSetup(() => useServerStats())

    await result.refresh()

    const view = result.view.value
    expect(view).toEqual({
      posts: 3,
      chars: 42,
      bytes: 812,
      likes: 7,
      favorites: 2,
      formatted: '812 B'
    })
    // 必须是普通值，不是 ref —— 否则 prop 传到子组件里 :style/:class 会失效
    expect(typeof view.posts).toBe('number')
    expect(typeof view.formatted).toBe('string')
    wrapper.unmount()
  })
})

describe('useServerStats · 累计互动（契约 4.2）', () => {
  it('把 likes / favorites 读进状态并透传给 view', async () => {
    setStatsApiFactory(() => fakeApi())
    const { result, wrapper } = withSetup(() => useServerStats())

    await result.refresh()

    expect(result.likes.value).toBe(7)
    expect(result.favorites.value).toBe(2)
    expect(result.view.value.likes).toBe(7)
    expect(result.view.value.favorites).toBe(2)
    wrapper.unmount()
  })

  it('缺少互动字段时按 0 处理，不产生 undefined/NaN', async () => {
    // 后端若还没升级到带互动的版本，统计行仍要能正常渲染
    setStatsApiFactory(() => fakeApi({ getStats: vi.fn(async () => ({ posts: 1, chars: 1, bytes: 1 })) }))
    const { result, wrapper } = withSetup(() => useServerStats())

    await result.refresh()

    expect(result.likes.value).toBe(0)
    expect(result.favorites.value).toBe(0)
    expect(result.view.value.likes).toBe(0)
    wrapper.unmount()
  })

  it('互动数是非法值时按 0 处理（不可信输入兜底）', async () => {
    setStatsApiFactory(() =>
      fakeApi({ getStats: vi.fn(async () => ({ posts: 1, likes: 'x', favorites: null })) })
    )
    const { result, wrapper } = withSetup(() => useServerStats())

    await result.refresh()
    expect(result.likes.value).toBe(0)
    expect(result.favorites.value).toBe(0)
    wrapper.unmount()
  })

  it('初始 likes / favorites 为 0', () => {
    setStatsApiFactory(() => fakeApi())
    const { result, wrapper } = withSetup(() => useServerStats())

    expect(result.likes.value).toBe(0)
    expect(result.favorites.value).toBe(0)
    wrapper.unmount()
  })
})

describe('useServerStats · 失败与降级', () => {
  it('请求失败时不抛错，且 available 保持 false', async () => {
    setStatsApiFactory(() =>
      fakeApi({
        getStats: vi.fn(async () => {
          throw new Error('无法连接服务端')
        })
      })
    )
    const { result, wrapper } = withSetup(() => useServerStats())

    await expect(result.refresh()).resolves.toBeUndefined()
    expect(result.available.value).toBe(false)
    expect(result.error.value).toBe('无法连接服务端')
    wrapper.unmount()
  })

  it('失败后不把已有数据清零（保留上次成功值）', async () => {
    const api = fakeApi()
    setStatsApiFactory(() => api)
    const { result, wrapper } = withSetup(() => useServerStats())

    await result.refresh()
    expect(result.posts.value).toBe(3)

    api.getStats.mockRejectedValueOnce(new Error('断了'))
    await result.refresh()

    // 数据仍是上次的值，但已标记不可用
    expect(result.posts.value).toBe(3)
    expect(result.available.value).toBe(false)
    wrapper.unmount()
  })

  it('响应缺字段时按 0 处理，不产生 NaN', async () => {
    setStatsApiFactory(() => fakeApi({ getStats: vi.fn(async () => ({ posts: 2 })) }))
    const { result, wrapper } = withSetup(() => useServerStats())

    await result.refresh()

    expect(result.chars.value).toBe(0)
    expect(result.bytes.value).toBe(0)
    expect(result.formatted.value).toBe('0 B')
    wrapper.unmount()
  })

  it('返回非对象时视为失败，不写入脏数据', async () => {
    setStatsApiFactory(() => fakeApi({ getStats: vi.fn(async () => null) }))
    const { result, wrapper } = withSetup(() => useServerStats())

    await result.refresh()
    expect(result.available.value).toBe(false)
    wrapper.unmount()
  })

  it('并发 refresh 只发一次请求（防重复点击）', async () => {
    const getStats = vi.fn(
      () => new Promise((resolve) => setTimeout(() => resolve({ posts: 1, chars: 1, bytes: 1 }), 10))
    )
    setStatsApiFactory(() => fakeApi({ getStats }))
    const { result, wrapper } = withSetup(() => useServerStats())

    await Promise.all([result.refresh(), result.refresh(), result.refresh()])
    expect(getStats).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('loading 在请求期间为 true', async () => {
    let release
    const gate = new Promise((resolve) => {
      release = () => resolve({ posts: 1, chars: 1, bytes: 1 })
    })
    setStatsApiFactory(() => fakeApi({ getStats: vi.fn(() => gate) }))
    const { result, wrapper } = withSetup(() => useServerStats())

    const pending = result.refresh()
    expect(result.loading.value).toBe(true)

    release()
    await pending
    await nextTick()
    expect(result.loading.value).toBe(false)
    wrapper.unmount()
  })
})

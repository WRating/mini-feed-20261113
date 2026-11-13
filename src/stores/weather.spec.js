/**
 * weather store 测试（TDD）
 *
 * 关注点：
 * - 缓存时效（20 分钟）
 * - 接口失败时读缓存降级，缓存也没有则给占位文案
 * - 无论失败与否都不能抛错，也不能阻塞发布
 *
 * 缓存已从 localStorage 改为**模块内内存缓存**（后端化后浏览器存储不再参与业务，
 * 见 docs/api-contract.md 第 6 节）。因此这里不能用 setStorage 注入缓存，
 * 改为：用一次成功的 refresh 写入缓存 → 新建 store 时读同一份模块缓存。
 * 这也顺带验证了「缓存跨 store 实例复用」这一真实行为。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import {
  useWeatherStore,
  setWeatherServiceFactory,
  resetWeatherServiceFactory,
  resetWeatherCache
} from './weather'

const NOW = new Date(2026, 10, 13, 10, 0, 0).getTime()
const MINUTE = 60_000
const HOUR = 60 * MINUTE

const GEO_RESULT = { lat: 28.19, lon: 112.97, place: '长沙市 · 湖南省' }
const WEATHER_RESULT = {
  temp: 14,
  apparent: 15,
  humidity: 95,
  code: 51,
  icon: '🌦️',
  label: '毛毛雨'
}

/** 造一个可控的天气服务替身 */
function fakeService(overrides = {}) {
  return {
    load: vi.fn(async () => ({
      ok: true,
      place: GEO_RESULT.place,
      weather: WEATHER_RESULT,
      error: null
    })),
    ...overrides
  }
}

/** 永远失败的服务 */
function failingService(error = 'down') {
  return fakeService({
    load: vi.fn(async () => ({ ok: false, place: '位置未知', weather: null, error }))
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  // 模块级缓存会跨用例残留，必须显式清理
  resetWeatherCache()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  resetWeatherCache()
  resetWeatherServiceFactory()
})

/** 注入服务替身并创建 store（工厂方式，避免与 Pinia 的 pinia 参数冲突） */
function useStoreWith(service) {
  setWeatherServiceFactory(() => service)
  return useWeatherStore()
}

/**
 * 在指定时刻用成功服务跑一次刷新以种下缓存，然后回到 NOW 时刻开一个全新 store。
 * 新 store 会在初始化阶段读到这份缓存。
 */
async function seedCache(loggedAt) {
  vi.setSystemTime(loggedAt)
  const store = useStoreWith(fakeService())
  await store.refresh()

  vi.setSystemTime(NOW)
  setActivePinia(createPinia())
  return store
}

describe('weather store · 加载成功', () => {
  it('加载成功后填充位置与天气，并标记 ok', async () => {
    const store = useStoreWith(fakeService())
    await store.refresh()

    expect(store.ok).toBe(true)
    expect(store.place).toBe('长沙市 · 湖南省')
    expect(store.weather.temp).toBe(14)
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
  })

  it('加载过程中 loading 为 true', async () => {
    let release
    const gate = new Promise((resolve) => {
      release = resolve
    })
    const service = fakeService({
      load: vi.fn(async () => {
        await gate
        return { ok: true, place: 'X', weather: WEATHER_RESULT, error: null }
      })
    })

    const store = useStoreWith(service)
    const pending = store.refresh()
    expect(store.loading).toBe(true)

    release()
    await pending
    expect(store.loading).toBe(false)
  })

  it('成功后缓存可被新 store 复用（无需再请求）', async () => {
    await seedCache(NOW)

    const service = failingService()
    const store = useStoreWith(service)

    // 首屏直接来自缓存，不必等接口
    expect(store.place).toBe('长沙市 · 湖南省')
    expect(store.weather.temp).toBe(14)
  })

  it('重复 refresh 时若已在加载中则直接忽略（避免并发请求）', async () => {
    let release
    const gate = new Promise((resolve) => {
      release = resolve
    })
    const load = vi.fn(async () => {
      await gate
      return { ok: true, place: 'X', weather: WEATHER_RESULT, error: null }
    })
    const store = useStoreWith(fakeService({ load }))

    const first = store.refresh()
    const second = store.refresh()
    release()
    await Promise.all([first, second])

    expect(load).toHaveBeenCalledTimes(1)
  })
})

describe('weather store · 失败降级', () => {
  it('接口失败且无缓存时给占位文案，不抛错', async () => {
    const store = useStoreWith(failingService('定位失败'))
    await expect(store.refresh()).resolves.toBeUndefined()

    expect(store.ok).toBe(false)
    expect(store.place).toBe('位置未知')
    expect(store.weather).toBeNull()
    expect(store.statusText).toBe('天气暂不可用')
  })

  it('接口失败时使用未过期缓存，并标记为缓存数据', async () => {
    await seedCache(NOW - 5 * MINUTE)

    const store = useStoreWith(failingService())
    await store.refresh()

    expect(store.place).toBe('长沙市 · 湖南省')
    expect(store.weather.temp).toBe(14)
    expect(store.fromCache).toBe(true)
    expect(store.ok).toBe(false)
  })

  it('天气为空但缓存有位置时，位置仍显示缓存值', async () => {
    // 先种一个「有位置、无天气」的缓存 —— 这是天气接口挂掉时的真实状态
    vi.setSystemTime(NOW - MINUTE)
    await useStoreWith(
      fakeService({
        load: vi.fn(async () => ({ ok: true, place: GEO_RESULT.place, weather: null, error: null }))
      })
    ).refresh()
    vi.setSystemTime(NOW)
    setActivePinia(createPinia())

    const store = useStoreWith(failingService())
    expect(store.place).toBe('长沙市 · 湖南省')

    await store.refresh()
    expect(store.place).toBe('长沙市 · 湖南省')
  })

  it('启动时先读缓存，保证首屏不空白', async () => {
    await seedCache(NOW - MINUTE)
    const store = useStoreWith(fakeService())

    expect(store.place).toBe('长沙市 · 湖南省')
    expect(store.weather.temp).toBe(14)
  })

  it('服务层意外抛错时收敛为 error 状态，不中断页面', async () => {
    const service = fakeService({
      load: vi.fn(async () => {
        throw new Error('boom')
      })
    })
    const store = useStoreWith(service)

    await expect(store.refresh()).resolves.toBeUndefined()
    expect(store.error).toBe('boom')
    expect(store.ok).toBe(false)
    expect(store.place).toBe('位置未知')
    expect(store.weather).toBeNull()
  })
})

describe('weather store · 缓存时效', () => {
  it('缓存新鲜（20 分钟内）时 isCacheFresh 为 true', async () => {
    await seedCache(NOW - 10 * MINUTE)
    const store = useStoreWith(fakeService())
    expect(store.isCacheFresh).toBe(true)
  })

  it('缓存过期（超过 20 分钟）时 isCacheFresh 为 false', async () => {
    await seedCache(NOW - 30 * MINUTE)
    const store = useStoreWith(fakeService())
    expect(store.isCacheFresh).toBe(false)
  })

  it('没有缓存时 isCacheFresh 为 false', () => {
    expect(useStoreWith(fakeService()).isCacheFresh).toBe(false)
  })

  it('成功刷新会更新缓存时间，使 isCacheFresh 重新为 true', async () => {
    await seedCache(NOW - 30 * MINUTE)
    const store = useStoreWith(fakeService())
    expect(store.isCacheFresh).toBe(false)

    await store.refresh()
    expect(store.isCacheFresh).toBe(true)
  })

  it('过期缓存仍可作为降级数据展示', async () => {
    await seedCache(NOW - 5 * HOUR)

    const store = useStoreWith(failingService())
    await store.refresh()

    expect(store.place).toBe('长沙市 · 湖南省')
    expect(store.fromCache).toBe(true)
  })
})

describe('weather store · 派生展示文案', () => {
  it('有天气时 statusText 包含天气现象', async () => {
    const store = useStoreWith(fakeService())
    await store.refresh()
    expect(store.statusText).toContain('毛毛雨')
  })

  it('湿度与体感拼进 detailText', async () => {
    const store = useStoreWith(fakeService())
    await store.refresh()
    expect(store.detailText).toContain('体感 15°')
    expect(store.detailText).toContain('湿度 95%')
  })

  it('缓存降级时提示来自缓存', async () => {
    await seedCache(NOW - MINUTE)

    const store = useStoreWith(failingService())
    await store.refresh()
    expect(store.detailText).toContain('缓存')
  })
})

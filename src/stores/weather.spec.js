/**
 * weather store 测试（TDD）
 *
 * 关注点：
 * - 缓存时效（定位 12 小时、天气 20 分钟）
 * - 接口失败时读缓存降级，缓存也没有则给占位文案
 * - 无论失败与否都不能抛错，也不能阻塞发布
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useWeatherStore } from './weather'
import { createStorage } from '@/services/storage'
import { setStorage } from '@/services/storage-context'
import { setWeatherServiceFactory, resetWeatherServiceFactory } from './weather'

const NOW = new Date(2026, 10, 13, 10, 0, 0).getTime()
const MINUTE = 60_000
const HOUR = 60 * MINUTE

let storage

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

beforeEach(() => {
  setActivePinia(createPinia())
  storage = createStorage()
  setStorage(storage)
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  setStorage(null)
  resetWeatherServiceFactory()
})

/** 注入天气服务替身（工厂方式，避免与 Pinia 的 pinia 参数冲突） */
function useStoreWith(service) {
  setWeatherServiceFactory(() => service)
  return useWeatherStore()
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

  it('成功后写入缓存', async () => {
    const store = useStoreWith(fakeService())
    await store.refresh()

    const cache = JSON.parse(storage.read('weather'))
    expect(cache.place).toBe('长沙市 · 湖南省')
    expect(cache.weather.temp).toBe(14)
  })
})

describe('weather store · 失败降级', () => {
  it('接口失败且无缓存时给占位文案，不抛错', async () => {
    const service = fakeService({
      load: vi.fn(async () => ({ ok: false, place: '位置未知', weather: null, error: '定位失败' }))
    })
    const store = useStoreWith(service)
    await expect(store.refresh()).resolves.toBeUndefined()

    expect(store.ok).toBe(false)
    expect(store.place).toBe('位置未知')
    expect(store.weather).toBeNull()
    expect(store.statusText).toBe('天气暂不可用')
  })

  it('接口失败时使用未过期缓存，并标记为缓存数据', async () => {
    storage.write(
      'weather',
      JSON.stringify({
        at: NOW - 5 * MINUTE,
        place: '长沙市 · 湖南省',
        weather: WEATHER_RESULT
      })
    )
    const service = fakeService({
      load: vi.fn(async () => ({ ok: false, place: '位置未知', weather: null, error: 'down' }))
    })

    const store = useStoreWith(service)
    await store.refresh()

    expect(store.place).toBe('长沙市 · 湖南省')
    expect(store.weather.temp).toBe(14)
    expect(store.fromCache).toBe(true)
    expect(store.ok).toBe(false)
  })

  it('天气为空但缓存有位置时，位置仍显示缓存值', async () => {
    storage.write(
      'weather',
      JSON.stringify({ at: NOW - MINUTE, place: '长沙市 · 湖南省', weather: null })
    )
    const service = fakeService({
      load: vi.fn(async () => ({ ok: false, place: '位置未知', weather: null, error: 'down' }))
    })

    const store = useStoreWith(service)
    await store.refresh()
    expect(store.place).toBe('长沙市 · 湖南省')
  })

  it('启动时先读缓存，保证首屏不空白', () => {
    storage.write(
      'weather',
      JSON.stringify({ at: NOW - MINUTE, place: '长沙市 · 湖南省', weather: WEATHER_RESULT })
    )
    const store = useStoreWith(fakeService())
    expect(store.place).toBe('长沙市 · 湖南省')
    expect(store.weather.temp).toBe(14)
  })

  it('缓存损坏时忽略，不抛错', () => {
    storage.write('weather', '{{{bad')
    expect(() => useStoreWith(fakeService())).not.toThrow()
    expect(useStoreWith(fakeService()).weather).toBeNull()
  })
})

describe('weather store · 缓存时效', () => {
  it('缓存新鲜（20 分钟内）时 shouldRefresh 为 false', () => {
    storage.write(
      'weather',
      JSON.stringify({ at: NOW - 10 * MINUTE, place: 'X', weather: WEATHER_RESULT })
    )
    const store = useStoreWith(fakeService())
    expect(store.isCacheFresh).toBe(true)
  })

  it('缓存过期（超过 20 分钟）时应当刷新', () => {
    storage.write(
      'weather',
      JSON.stringify({ at: NOW - 30 * MINUTE, place: 'X', weather: WEATHER_RESULT })
    )
    const store = useStoreWith(fakeService())
    expect(store.isCacheFresh).toBe(false)
  })

  it('没有缓存时应当刷新', () => {
    expect(useStoreWith(fakeService()).isCacheFresh).toBe(false)
  })

  it('过期缓存仍可作为降级数据展示', async () => {
    storage.write(
      'weather',
      JSON.stringify({ at: NOW - 5 * HOUR, place: '长沙市 · 湖南省', weather: WEATHER_RESULT })
    )
    const service = fakeService({
      load: vi.fn(async () => ({ ok: false, place: '位置未知', weather: null, error: 'down' }))
    })
    const store = useStoreWith(service)
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
    storage.write(
      'weather',
      JSON.stringify({ at: NOW - MINUTE, place: '长沙市 · 湖南省', weather: WEATHER_RESULT })
    )
    const service = fakeService({
      load: vi.fn(async () => ({ ok: false, place: '位置未知', weather: null, error: 'down' }))
    })
    const store = useStoreWith(service)
    await store.refresh()
    expect(store.detailText).toContain('缓存')
  })
})

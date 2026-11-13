/**
 * 天气 store。
 *
 * 拿到的是「今天在哪儿、什么天气」这类易失信息，设计上遵循两条底线：
 * 1) 先读缓存再刷新，首屏不空白；
 * 2) 接口失败一律降级（用缓存或占位文案），绝不抛错影响发布。
 *
 * 注：服务通过工厂注入，而不是 useWeatherStore(service) —— Pinia 会把
 * useStore 的第一个参数当成 pinia 实例，传服务对象会导致初始化异常。
 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { useStorage } from '@/services/storage-context'
import { createWeatherService } from '@/services/weather-api'

const WEATHER_KEY = 'weather'

/** 缓存 20 分钟后视为过期，允许后台刷新 */
export const CACHE_TTL = 20 * 60 * 1000

let serviceFactory = () => createWeatherService()

/** 替换天气服务工厂（测试注入替身用） */
export function setWeatherServiceFactory(factory) {
  serviceFactory = factory
}

/** 恢复默认工厂 */
export function resetWeatherServiceFactory() {
  serviceFactory = () => createWeatherService()
}

function readCache(storage) {
  const raw = storage.read(WEATHER_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    if (!Number.isFinite(parsed.at)) return null
    return parsed
  } catch {
    return null
  }
}

export const useWeatherStore = defineStore('weather', () => {
  const storage = useStorage()
  const service = serviceFactory()

  const cached = readCache(storage)

  const place = ref(cached?.place || '定位中…')
  const weather = ref(cached?.weather || null)
  const cachedAt = ref(cached?.at || 0)
  const loading = ref(false)
  const ok = ref(false)
  const fromCache = ref(Boolean(cached))
  const error = ref(null)

  /** 缓存是否仍然新鲜 */
  const isCacheFresh = computed(
    () => Boolean(cachedAt.value) && Date.now() - cachedAt.value < CACHE_TTL
  )

  /** 主文案：天气现象 + 温度 */
  const statusText = computed(() => {
    if (!weather.value) return '天气暂不可用'
    return `${weather.value.label} ${weather.value.temp}°`
  })

  /** 次要文案：体感与湿度；缓存降级时明确标注来源 */
  const detailText = computed(() => {
    if (!weather.value) {
      return fromCache.value ? '位置来自缓存' : '网络或接口不可用'
    }
    const parts = []
    if (weather.value.apparent !== null) parts.push(`体感 ${weather.value.apparent}°`)
    if (weather.value.humidity !== null) parts.push(`湿度 ${weather.value.humidity}%`)
    if (fromCache.value) parts.push('缓存数据')
    return parts.join(' · ')
  })

  function persist(placeValue, weatherValue) {
    const at = Date.now()
    cachedAt.value = at
    storage.write(
      WEATHER_KEY,
      JSON.stringify({ at, place: placeValue, weather: weatherValue })
    )
  }

  /**
   * 刷新天气。任何失败都收敛为状态变化，不向外抛错。
   */
  async function refresh() {
    if (loading.value) return

    loading.value = true
    error.value = null

    try {
      const result = await service.load()

      if (result.ok) {
        place.value = result.place
        weather.value = result.weather
        ok.value = true
        fromCache.value = false
        persist(result.place, result.weather)
        return
      }

      // 失败：保留/回退到缓存，没有缓存才用占位文案
      error.value = result.error
      ok.value = false
      fromCache.value = Boolean(cachedAt.value)

      if (!cachedAt.value) {
        place.value = result.place || '位置未知'
        weather.value = null
      }
    } catch (cause) {
      // 兜底：服务层理论上不会抛错，但绝不能因此中断页面
      error.value = cause?.message || '天气获取失败'
      ok.value = false
      fromCache.value = Boolean(cachedAt.value)
      if (!cachedAt.value) {
        place.value = '位置未知'
        weather.value = null
      }
    } finally {
      loading.value = false
    }
  }

  return {
    place,
    weather,
    loading,
    ok,
    fromCache,
    error,
    isCacheFresh,
    statusText,
    detailText,
    refresh
  }
})

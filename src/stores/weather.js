/**
 * 天气 store。
 *
 * 拿到的是「今天在哪儿、什么天气」这类易失信息，设计上遵循两条底线：
 * 1) 先读缓存再刷新，首屏不空白；
 * 2) 接口失败一律降级（用缓存或占位文案），绝不抛错影响发布。
 *
 * 缓存从 useStorage()（localStorage）改为**模块内内存缓存**：
 * 后端化之后业务数据都在服务端，浏览器存储不再参与业务（见 docs/api-contract.md 第 6 节），
 * 为了最后一点天气残留继续保留 storage-shim 这类补丁不划算。代价是刷新页面后
 * 缓存失效、会重新定位一次 —— 对「20 分钟 TTL」的天气数据而言完全可以接受。
 *
 * 注：服务通过工厂注入，而不是 useWeatherStore(service) —— Pinia 会把
 * useStore 的第一个参数当成 pinia 实例，传服务对象会导致初始化异常。
 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { createWeatherService } from '@/services/weather-api'

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

/**
 * 模块级缓存：{ at, place, weather } 或 null。
 *
 * 放在模块作用域而不是 store 内，是为了让「同一页面内多个 store 实例」共享一份缓存
 * （Pinia 单例下通常只有一个实例，但保持这个语义能让缓存不依赖 Pinia 生命周期）。
 */
let weatherCache = null

/** 清空内存缓存（测试隔离用；也会在处理隐私数据时被显式调用） */
export function resetWeatherCache() {
  weatherCache = null
}

/**
 * 读取缓存，结构不符时返回 null。
 * 内存缓存理论上不会损坏，但类型校验保证了「有人手动塞了脏数据」也不会崩。
 */
function readCache() {
  const cached = weatherCache
  if (!cached || typeof cached !== 'object' || Array.isArray(cached)) return null
  if (!Number.isFinite(cached.at)) return null
  return cached
}

export const useWeatherStore = defineStore('weather', () => {
  const service = serviceFactory()

  const cached = readCache()

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

  /** 写入模块级缓存 */
  function persist(placeValue, weatherValue) {
    const at = Date.now()
    cachedAt.value = at
    weatherCache = { at, place: placeValue, weather: weatherValue }
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

/**
 * 天气服务：IP 定位 → 中文地名 → 实时天气。
 *
 * 全部走免 Key、支持跨域的开放接口。这里的职责是把「外部接口的各种不靠谱」
 * 收敛成 UI 可以直接使用的结构，调用方永远拿到 { ok, place, weather, error }。
 */
import { describeWeather } from '@/utils/weather-code'

/** 主源 ipinfo 走 https 且 CORS 宽松，备源 ipwho 在前者限流时兜底 */
const GEO_PROVIDERS = [
  {
    name: 'ipinfo.io',
    url: 'https://ipinfo.io/json',
    parse(data) {
      if (!data || typeof data.loc !== 'string') return null
      const [latRaw, lonRaw] = data.loc.split(',')
      const lat = Number.parseFloat(latRaw)
      const lon = Number.parseFloat(lonRaw)
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
      return { lat, lon, fallbackPlace: data.city || '' }
    }
  },
  {
    name: 'ipwho.is',
    url: 'https://ipwho.is/',
    parse(data) {
      if (!data || data.success === false) return null
      if (!Number.isFinite(data.latitude) || !Number.isFinite(data.longitude)) return null
      return { lat: data.latitude, lon: data.longitude, fallbackPlace: data.city || '' }
    }
  }
]

const REVERSE_GEO_URL = 'https://api.bigdatacloud.net/data/reverse-geocode-client'
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast'

const DEFAULT_TIMEOUT = 8000

export function createWeatherService({ fetchImpl = globalThis.fetch, timeout = DEFAULT_TIMEOUT } = {}) {
  /** 带超时的 JSON 请求；非 2xx 或不合法 JSON 一律抛错 */
  async function fetchJSON(url) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)
    try {
      const response = await fetchImpl(url, { signal: controller.signal })
      if (!response || !response.ok) {
        throw new Error(`请求失败：${url}`)
      }
      return await response.json()
    } finally {
      clearTimeout(timer)
    }
  }

  /** 坐标 → 中文省市名；失败不影响主流程 */
  async function reverseGeocode(lat, lon) {
    try {
      const data = await fetchJSON(
        `${REVERSE_GEO_URL}?latitude=${lat}&longitude=${lon}&localityLanguage=zh`
      )
      const city = (data.city || data.locality || '').trim()
      const region = (data.principalSubdivision || '').trim()
      if (!city) return ''
      return region && region !== city ? `${city} · ${region}` : city
    } catch {
      return ''
    }
  }

  /** 依次尝试各定位源，第一个成功即返回 */
  async function locate() {
    let lastError = null

    for (const provider of GEO_PROVIDERS) {
      try {
        const data = await fetchJSON(provider.url)
        const parsed = provider.parse(data)
        if (!parsed) {
          lastError = new Error('定位数据不完整')
          continue
        }

        const place =
          (await reverseGeocode(parsed.lat, parsed.lon)) ||
          parsed.fallbackPlace ||
          '位置未知'

        return { lat: parsed.lat, lon: parsed.lon, place }
      } catch (error) {
        lastError = error
      }
    }

    throw lastError || new Error('定位失败')
  }

  /** 拉取实时天气并规范化为 UI 结构 */
  async function fetchWeather({ lat, lon }) {
    const url =
      `${WEATHER_URL}?latitude=${lat}&longitude=${lon}` +
      '&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code' +
      '&timezone=auto'

    const data = await fetchJSON(url)
    const current = data && data.current
    if (!current || !Number.isFinite(current.temperature_2m)) {
      throw new Error('天气数据不完整')
    }

    const { icon, label } = describeWeather(current.weather_code)
    return {
      temp: Math.round(current.temperature_2m),
      apparent: Number.isFinite(current.apparent_temperature)
        ? Math.round(current.apparent_temperature)
        : null,
      humidity: Number.isFinite(current.relative_humidity_2m)
        ? Math.round(current.relative_humidity_2m)
        : null,
      code: current.weather_code,
      icon,
      label
    }
  }

  /**
   * 组合加载。定位失败则整体失败；天气失败时仍返回位置，便于 UI 只缺一块。
   * 任何情况都不抛错，失败原因放在 error 里。
   */
  async function load() {
    let geo
    try {
      geo = await locate()
    } catch (error) {
      return { ok: false, place: '位置未知', weather: null, error: error.message || '定位失败' }
    }

    try {
      const weather = await fetchWeather(geo)
      return { ok: true, place: geo.place, weather, error: null }
    } catch (error) {
      return { ok: false, place: geo.place, weather: null, error: error.message || '天气获取失败' }
    }
  }

  return { locate, fetchWeather, load }
}

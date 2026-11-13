/**
 * 天气服务测试（TDD）
 *
 * 外部接口不可靠（限流 / 断网 / 返回畸形数据），所以这里重点验证：
 * - 多源 IP 定位的链式容错
 * - 中文地名反查失败时仍能给出可用结果
 * - 返回结构被规范化，UI 不需要做防御性判断
 * 所有 fetch 都由测试注入，不打真实网络。
 */
import { describe, it, expect, vi } from 'vitest'
import { createWeatherService } from './weather-api'

/** 造一个"按 URL 匹配返回"的假 fetch */
function fakeFetch(routes) {
  return vi.fn(async (url) => {
    for (const [pattern, handler] of routes) {
      if (url.includes(pattern)) {
        const result = typeof handler === 'function' ? handler() : handler
        if (result instanceof Error) throw result
        return {
          ok: true,
          status: 200,
          json: async () => result
        }
      }
    }
    throw new Error(`unexpected url: ${url}`)
  })
}

const GEO = { latitude: 28.19, longitude: 112.97 }
const WEATHER = {
  current: {
    temperature_2m: 14.3,
    relative_humidity_2m: 95,
    apparent_temperature: 15.1,
    weather_code: 51
  }
}

describe('定位 · 多源容错', () => {
  it('主源可用时使用主源', async () => {
    const fetchImpl = fakeFetch([
      ['ipinfo.io', { loc: '28.19,112.97', city: 'Changsha' }],
      ['bigdatacloud', { city: '长沙市', principalSubdivision: '湖南省' }]
    ])
    const service = createWeatherService({ fetchImpl })
    const geo = await service.locate()

    expect(geo.lat).toBeCloseTo(28.19)
    expect(geo.lon).toBeCloseTo(112.97)
    expect(geo.place).toBe('长沙市 · 湖南省')
  })

  it('主源失败时自动切换备源', async () => {
    const fetchImpl = fakeFetch([
      ['ipinfo.io', new Error('429 too many requests')],
      ['ipwho.is', { success: true, latitude: 28.19, longitude: 112.97, city: 'Changsha' }],
      ['bigdatacloud', { city: '长沙市', principalSubdivision: '湖南省' }]
    ])
    const service = createWeatherService({ fetchImpl })
    const geo = await service.locate()

    expect(geo.place).toBe('长沙市 · 湖南省')
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('全部定位源失败时抛错，让上层降级', async () => {
    const fetchImpl = fakeFetch([
      ['ipinfo.io', new Error('down')],
      ['ipwho.is', new Error('down')]
    ])
    const service = createWeatherService({ fetchImpl })
    await expect(service.locate()).rejects.toThrow()
  })

  it('主源返回畸形数据时视为失败并切备源', async () => {
    const fetchImpl = fakeFetch([
      ['ipinfo.io', { loc: 'not-a-location' }],
      ['ipwho.is', { success: true, latitude: 1, longitude: 2, city: 'X' }]
    ])
    const service = createWeatherService({ fetchImpl })
    const geo = await service.locate()
    expect(geo.lat).toBe(1)
  })

  it('地名反查失败时回退为 IP 提供的城市名', async () => {
    const fetchImpl = fakeFetch([
      ['ipinfo.io', { loc: '28.19,112.97', city: 'Changsha' }],
      ['bigdatacloud', new Error('geo down')]
    ])
    const service = createWeatherService({ fetchImpl })
    const geo = await service.locate()
    expect(geo.place).toBe('Changsha')
  })

  it('连城市名都没有时给出位置未知文案', async () => {
    const fetchImpl = fakeFetch([
      ['ipinfo.io', { loc: '28.19,112.97' }],
      ['bigdatacloud', new Error('down')]
    ])
    const service = createWeatherService({ fetchImpl })
    expect((await service.locate()).place).toBe('位置未知')
  })
})

describe('天气获取', () => {
  it('把接口返回规范化成 UI 需要的字段', async () => {
    const fetchImpl = fakeFetch([['open-meteo', WEATHER]])
    const service = createWeatherService({ fetchImpl })
    const weather = await service.fetchWeather({ lat: 28.19, lon: 112.97 })

    expect(weather.temp).toBe(14)          // 取整
    expect(weather.apparent).toBe(15)
    expect(weather.humidity).toBe(95)
    expect(weather.code).toBe(51)
    expect(weather.icon).toBe('🌦️')
    expect(weather.label).toBe('毛毛雨')
  })

  it('温度四舍五入到整数', async () => {
    const fetchImpl = fakeFetch([
      ['open-meteo', { current: { temperature_2m: 14.6, weather_code: 0, relative_humidity_2m: 50, apparent_temperature: 13.4 } }]
    ])
    const service = createWeatherService({ fetchImpl })
    const weather = await service.fetchWeather({ lat: 1, lon: 1 })
    expect(weather.temp).toBe(15)
    expect(weather.apparent).toBe(13)
  })

  it('接口缺少 current 时抛错', async () => {
    const fetchImpl = fakeFetch([['open-meteo', {}]])
    const service = createWeatherService({ fetchImpl })
    await expect(service.fetchWeather({ lat: 1, lon: 1 })).rejects.toThrow()
  })

  it('接口返回非 2xx 时抛错', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }))
    const service = createWeatherService({ fetchImpl })
    await expect(service.fetchWeather({ lat: 1, lon: 1 })).rejects.toThrow()
  })

  it('请求 URL 带上经纬度与时区参数', async () => {
    const fetchImpl = fakeFetch([['open-meteo', WEATHER]])
    const service = createWeatherService({ fetchImpl })
    await service.fetchWeather({ lat: 28.19, lon: 112.97 })

    const url = fetchImpl.mock.calls[0][0]
    expect(url).toContain('latitude=28.19')
    expect(url).toContain('longitude=112.97')
    expect(url).toContain('timezone=auto')
    expect(url).toContain('weather_code')
  })
})

describe('组合加载 load()', () => {
  it('依次完成定位与天气，返回合并结果', async () => {
    const fetchImpl = fakeFetch([
      ['ipinfo.io', { loc: '28.19,112.97', city: 'Changsha' }],
      ['bigdatacloud', { city: '长沙市', principalSubdivision: '湖南省' }],
      ['open-meteo', WEATHER]
    ])
    const service = createWeatherService({ fetchImpl })
    const result = await service.load()

    expect(result.ok).toBe(true)
    expect(result.place).toBe('长沙市 · 湖南省')
    expect(result.weather.temp).toBe(14)
  })

  it('定位失败时返回 ok:false 并说明原因，不抛错', async () => {
    const fetchImpl = fakeFetch([
      ['ipinfo.io', new Error('down')],
      ['ipwho.is', new Error('down')]
    ])
    const service = createWeatherService({ fetchImpl })
    const result = await service.load()

    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
    expect(result.weather).toBeNull()
  })

  it('定位成功但天气失败时仍返回位置信息', async () => {
    const fetchImpl = fakeFetch([
      ['ipinfo.io', { loc: '28.19,112.97', city: 'Changsha' }],
      ['bigdatacloud', { city: '长沙市', principalSubdivision: '湖南省' }],
      ['open-meteo', new Error('down')]
    ])
    const service = createWeatherService({ fetchImpl })
    const result = await service.load()

    expect(result.ok).toBe(false)
    expect(result.place).toBe('长沙市 · 湖南省')
    expect(result.weather).toBeNull()
  })
})

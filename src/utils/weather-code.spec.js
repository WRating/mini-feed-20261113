/**
 * 天气 WMO 码映射测试（TDD）
 */
import { describe, it, expect } from 'vitest'
import { describeWeather } from './weather-code'

describe('describeWeather', () => {
  it('晴天返回晴天文案与太阳图标', () => {
    expect(describeWeather(0)).toEqual({ icon: '☀️', label: '晴' })
  })

  it('主要多云与阴天区分开', () => {
    expect(describeWeather(1).label).toBe('大部晴朗')
    expect(describeWeather(2).label).toBe('多云')
    expect(describeWeather(3).label).toBe('阴')
  })

  it('雾类天气', () => {
    expect(describeWeather(45).label).toBe('有雾')
    expect(describeWeather(48).label).toBe('雾凇')
  })

  it('毛毛雨 / 雨 / 阵雨分级', () => {
    expect(describeWeather(51).label).toBe('毛毛雨')
    expect(describeWeather(61).label).toBe('小雨')
    expect(describeWeather(63).label).toBe('中雨')
    expect(describeWeather(65).label).toBe('大雨')
    expect(describeWeather(80).label).toBe('阵雨')
  })

  it('冻雨单独标注', () => {
    expect(describeWeather(66).label).toBe('冻雨')
  })

  it('雪与雷暴', () => {
    expect(describeWeather(71).label).toBe('小雪')
    expect(describeWeather(75).label).toBe('大雪')
    expect(describeWeather(95).label).toBe('雷阵雨')
    expect(describeWeather(99).label).toBe('雷暴伴冰雹')
  })

  it('未知码回退为「未知天气」，不抛错', () => {
    expect(describeWeather(1234)).toEqual({ icon: '🌡️', label: '未知天气' })
    expect(describeWeather(null).label).toBe('未知天气')
    expect(describeWeather(undefined).label).toBe('未知天气')
  })

  it('返回对象形状稳定（icon 与 label 均为非空字符串）', () => {
    for (const code of [0, 2, 45, 61, 71, 95, 99]) {
      const result = describeWeather(code)
      expect(typeof result.icon).toBe('string')
      expect(result.icon.length).toBeGreaterThan(0)
      expect(typeof result.label).toBe('string')
      expect(result.label.length).toBeGreaterThan(0)
    }
  })
})

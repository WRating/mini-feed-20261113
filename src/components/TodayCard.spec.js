/**
 * TodayCard 组件测试（TDD）
 * 展示所在地、实时时钟与天气；刷新是唯一交互。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import TodayCard from './TodayCard.vue'

const NOW = new Date(2026, 10, 13, 10, 0, 0).getTime()
const find = (wrapper, testid) => wrapper.find(`[data-testid="${testid}"]`)

const baseProps = {
  place: '长沙市 · 湖南省',
  weather: { temp: 14, apparent: 15, humidity: 95, code: 51, icon: '🌦️', label: '毛毛雨' },
  detailText: '体感 15° · 湿度 95%',
  loading: false
}

let wrapper

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  wrapper?.unmount()
})

describe('TodayCard · 渲染', () => {
  it('显示所在地', () => {
    wrapper = mount(TodayCard, { props: baseProps })
    expect(find(wrapper, 'weather-location').text()).toContain('长沙市 · 湖南省')
  })

  it('显示温度与天气现象', () => {
    wrapper = mount(TodayCard, { props: baseProps })
    expect(find(wrapper, 'weather-temp').text()).toBe('14°')
    expect(find(wrapper, 'weather-desc').text()).toBe('毛毛雨')
  })

  it('显示天气图标', () => {
    wrapper = mount(TodayCard, { props: baseProps })
    expect(find(wrapper, 'weather-icon').text()).toBe('🌦️')
  })

  it('显示体感与湿度详情', () => {
    wrapper = mount(TodayCard, { props: baseProps })
    expect(find(wrapper, 'weather-detail').text()).toBe('体感 15° · 湿度 95%')
  })

  it('显示当前时间，并每秒走动', async () => {
    wrapper = mount(TodayCard, { props: baseProps })
    expect(find(wrapper, 'weather-time').text()).toBe('11月13日 周五 10:00:00')

    vi.advanceTimersByTime(1000)
    await wrapper.vm.$nextTick()
    expect(find(wrapper, 'weather-time').text()).toBe('11月13日 周五 10:00:01')
  })
})

describe('TodayCard · 降级展示', () => {
  it('天气为空时温度显示占位符', () => {
    wrapper = mount(TodayCard, { props: { ...baseProps, weather: null, detailText: '网络或接口不可用' } })
    expect(find(wrapper, 'weather-temp').text()).toBe('--°')
    expect(find(wrapper, 'weather-desc').text()).toBe('天气暂不可用')
  })

  it('位置未知时照常展示', () => {
    wrapper = mount(TodayCard, { props: { ...baseProps, place: '位置未知' } })
    expect(find(wrapper, 'weather-location').text()).toContain('位置未知')
  })

  it('缓存数据会给出标注', () => {
    wrapper = mount(TodayCard, { props: { ...baseProps, detailText: '体感 15° · 缓存数据' } })
    expect(find(wrapper, 'weather-detail').text()).toContain('缓存')
  })
})

describe('TodayCard · 刷新交互', () => {
  it('点击刷新按钮 emit refresh', async () => {
    wrapper = mount(TodayCard, { props: baseProps })
    await find(wrapper, 'refresh-btn').trigger('click')

    expect(wrapper.emitted('refresh')).toHaveLength(1)
  })

  it('加载中时按钮禁用，避免重复请求', () => {
    wrapper = mount(TodayCard, { props: { ...baseProps, loading: true } })
    expect(find(wrapper, 'refresh-btn').attributes('disabled')).toBeDefined()
  })

  it('加载中时按钮带旋转样式', () => {
    wrapper = mount(TodayCard, { props: { ...baseProps, loading: true } })
    expect(find(wrapper, 'refresh-btn').classes()).toContain('is-loading')
  })

  it('刷新按钮有可读标签', () => {
    wrapper = mount(TodayCard, { props: baseProps })
    expect(find(wrapper, 'refresh-btn').attributes('aria-label')).toBe('刷新天气')
  })
})

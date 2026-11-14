/**
 * MoodCard 组件测试（TDD）
 *
 * 它取代了原来的天气卡片：天气依赖 IP 定位与第三方接口，在受限网络下长期不可用，
 * 而心情是完全本地可控的信息，不需要任何外部依赖就不会"暂不可用"。
 *
 * 组件仍是「只上报意图」：点击某个心情时 emit('select', key)，
 * 由父级决定写到哪里；组件自己不碰 store。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import MoodCard from './MoodCard.vue'

const NOW = new Date(2026, 10, 14, 9, 30, 0).getTime()
const find = (wrapper, testid) => wrapper.find(`[data-testid="${testid}"]`)

const baseProps = {
  mood: 'great',
  moods: [
    { key: 'great', emoji: '😄', label: '心情好' },
    { key: 'calm', emoji: '🙂', label: '平静' },
    { key: 'tired', emoji: '😮‍💨', label: '有点累' },
    { key: 'down', emoji: '😔', label: '低落' },
    { key: 'fired', emoji: '🔥', label: '干劲满满' }
  ]
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

describe('MoodCard · 展示', () => {
  it('展示当前心情的表情与文案', () => {
    wrapper = mount(MoodCard, { props: baseProps })

    expect(find(wrapper, 'mood-emoji').text()).toBe('😄')
    expect(find(wrapper, 'mood-label').text()).toBe('心情好')
  })

  it('不同心情显示对应内容', () => {
    wrapper = mount(MoodCard, { props: { ...baseProps, mood: 'fired' } })

    expect(find(wrapper, 'mood-emoji').text()).toBe('🔥')
    expect(find(wrapper, 'mood-label').text()).toBe('干劲满满')
  })

  it('展示「今日心情」标题', () => {
    wrapper = mount(MoodCard, { props: baseProps })
    expect(wrapper.text()).toContain('今日心情')
  })

  it('心情为空时回落到默认（不渲染空白表情）', () => {
    wrapper = mount(MoodCard, { props: { ...baseProps, mood: 'bogus' } })

    expect(find(wrapper, 'mood-emoji').text()).toBe('😄')
    expect(find(wrapper, 'mood-label').text()).toBe('心情好')
  })

  it('不依赖任何网络数据源（没有"暂不可用"这类文案）', () => {
    wrapper = mount(MoodCard, { props: baseProps })
    expect(wrapper.text()).not.toContain('暂不可用')
  })

  it('显示实时时钟，并每秒走动', async () => {
    wrapper = mount(MoodCard, { props: baseProps })
    expect(find(wrapper, 'mood-time').text()).toBe('11月14日 周六 09:30:00')

    vi.advanceTimersByTime(1000)
    await wrapper.vm.$nextTick()
    expect(find(wrapper, 'mood-time').text()).toBe('11月14日 周六 09:30:01')
  })
})

describe('MoodCard · 切换心情', () => {
  it('渲染全部可选心情', () => {
    wrapper = mount(MoodCard, { props: baseProps })
    expect(wrapper.findAll('[data-testid="mood-option"]')).toHaveLength(5)
  })

  it('每项显示表情', () => {
    wrapper = mount(MoodCard, { props: baseProps })
    const options = wrapper.findAll('[data-testid="mood-option"]')

    expect(options.map((o) => o.text())).toEqual(['😄', '🙂', '😮‍💨', '😔', '🔥'])
  })

  it('当前心情标记为选中', () => {
    wrapper = mount(MoodCard, { props: { ...baseProps, mood: 'tired' } })
    const selected = wrapper.findAll('[data-testid="mood-option"]').filter(
      (o) => o.attributes('aria-pressed') === 'true'
    )

    expect(selected).toHaveLength(1)
    expect(selected[0].text()).toBe('😮‍💨')
  })

  it('点击其他心情 emit select 并带上 key', async () => {
    wrapper = mount(MoodCard, { props: baseProps })
    await wrapper.findAll('[data-testid="mood-option"]')[3].trigger('click')

    expect(wrapper.emitted('select')[0][0]).toBe('down')
  })

  it('点击当前心情也 emit（由父级决定是否忽略，组件不擅自吞掉交互）', async () => {
    wrapper = mount(MoodCard, { props: baseProps })
    await wrapper.findAll('[data-testid="mood-option"]')[0].trigger('click')

    expect(wrapper.emitted('select')).toBeTruthy()
  })

  it('保存中时禁用按钮，避免重复请求', () => {
    wrapper = mount(MoodCard, { props: { ...baseProps, pending: true } })
    const options = wrapper.findAll('[data-testid="mood-option"]')

    expect(options[0].attributes('disabled')).toBeDefined()
  })

  it('保存中时点击不发事件', async () => {
    wrapper = mount(MoodCard, { props: { ...baseProps, pending: true } })
    await wrapper.findAll('[data-testid="mood-option"]')[2].trigger('click')

    expect(wrapper.emitted('select')).toBeFalsy()
  })

  it('心情选项带 aria-label，读屏可辨识', () => {
    wrapper = mount(MoodCard, { props: baseProps })
    expect(wrapper.findAll('[data-testid="mood-option"]')[0].attributes('aria-label')).toBe('心情好')
  })
})

describe('MoodCard · 无数据兜底', () => {
  it('moods 为空数组时不崩溃，也不渲染选项', () => {
    wrapper = mount(MoodCard, { props: { mood: 'great', moods: [] } })

    expect(find(wrapper, 'mood-option').exists()).toBe(false)
    // 主展示仍要有个兜底，不能让卡片空掉
    expect(wrapper.text()).toContain('今日心情')
  })

  it('未传 moods 时使用内置白名单（组件可独立使用）', () => {
    wrapper = mount(MoodCard, { props: { mood: 'calm' } })
    expect(wrapper.findAll('[data-testid="mood-option"]').length).toBeGreaterThan(0)
  })
})

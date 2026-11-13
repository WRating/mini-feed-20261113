/**
 * TabBar 组件测试（TDD）
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import TabBar from './TabBar.vue'

const tabs = [
  { key: 'home', label: '首页' },
  { key: 'profile', label: '个人中心' }
]

let wrapper

afterEach(() => {
  wrapper?.unmount()
})

describe('TabBar', () => {
  it('渲染全部标签', () => {
    wrapper = mount(TabBar, { props: { tabs, modelValue: 'home' } })
    const buttons = wrapper.findAll('[data-testid^="tab-"]')

    expect(buttons).toHaveLength(2)
    expect(buttons[0].text()).toBe('首页')
  })

  it('当前标签带 is-active 与 aria-selected', () => {
    wrapper = mount(TabBar, { props: { tabs, modelValue: 'profile' } })
    const buttons = wrapper.findAll('[data-testid^="tab-"]')

    expect(buttons[0].classes()).not.toContain('is-active')
    expect(buttons[1].classes()).toContain('is-active')
    expect(buttons[1].attributes('aria-selected')).toBe('true')
  })

  it('点击标签 emit update:modelValue', async () => {
    wrapper = mount(TabBar, { props: { tabs, modelValue: 'home' } })
    await wrapper.findAll('[data-testid^="tab-"]')[1].trigger('click')

    expect(wrapper.emitted('update:modelValue')[0][0]).toBe('profile')
  })

  it('点击当前标签不重复 emit', async () => {
    wrapper = mount(TabBar, { props: { tabs, modelValue: 'home' } })
    await wrapper.findAll('[data-testid^="tab-"]')[0].trigger('click')

    expect(wrapper.emitted('update:modelValue')).toBeFalsy()
  })

  it('容器带 tablist 语义', () => {
    wrapper = mount(TabBar, { props: { tabs, modelValue: 'home' } })
    expect(wrapper.find('.tabbar').attributes('role')).toBe('tablist')
  })
})

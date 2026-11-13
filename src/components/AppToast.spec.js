/**
 * AppToast 组件测试（TDD）
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import AppToast from './AppToast.vue'

let wrapper

afterEach(() => {
  wrapper?.unmount()
})

describe('AppToast', () => {
  it('message 为空时不显示', () => {
    wrapper = mount(AppToast, { props: { message: '' } })
    expect(wrapper.find('[data-testid="toast"]').classes()).not.toContain('is-show')
  })

  it('有 message 时显示并带 is-show', () => {
    wrapper = mount(AppToast, { props: { message: '已导出 2 条动态' } })
    const toast = wrapper.find('[data-testid="toast"]')

    expect(toast.classes()).toContain('is-show')
    expect(toast.text()).toBe('已导出 2 条动态')
  })

  it('带 status 语义，便于读屏播报', () => {
    wrapper = mount(AppToast, { props: { message: 'x' } })
    const toast = wrapper.find('[data-testid="toast"]')
    expect(toast.attributes('role')).toBe('status')
  })

  it('message 变化时内容同步更新', async () => {
    wrapper = mount(AppToast, { props: { message: '第一条' } })
    await wrapper.setProps({ message: '第二条' })

    expect(wrapper.find('[data-testid="toast"]').text()).toBe('第二条')
  })
})

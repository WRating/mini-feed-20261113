/**
 * ConnectionWarning 组件测试（TDD）
 *
 * 告警条的含义变了：不再是「浏览器禁用了本地存储」，
 * 而是「连不上后端服务」——这是切到 HTTP 之后真正会让用户卡住的场景。
 * 因此除了文案，还必须给一个「重试」入口，否则用户只能刷新整个页面。
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ConnectionWarning from './ConnectionWarning.vue'

const find = (wrapper, testid) => wrapper.find(`[data-testid="${testid}"]`)

let wrapper

afterEach(() => {
  wrapper?.unmount()
})

describe('ConnectionWarning · 渲染', () => {
  it('默认文案说明无法连接服务端', () => {
    wrapper = mount(ConnectionWarning)
    const text = find(wrapper, 'connection-warning-text').text()

    expect(text).toContain('无法连接服务端')
    expect(text).toContain('数据')
  })

  it('可传入自定义 message 覆盖默认文案', () => {
    wrapper = mount(ConnectionWarning, { props: { message: '后端服务未启动，请执行 npm run dev。' } })
    expect(find(wrapper, 'connection-warning-text').text()).toBe('后端服务未启动，请执行 npm run dev。')
  })

  it('message 为空时回退到默认文案，不渲染空白告警', () => {
    wrapper = mount(ConnectionWarning, { props: { message: '' } })
    expect(find(wrapper, 'connection-warning-text').text()).toContain('无法连接服务端')
  })

  it('告警条带 alert 语义', () => {
    wrapper = mount(ConnectionWarning)
    expect(find(wrapper, 'connection-warning').attributes('role')).toBe('alert')
  })

  it('同时渲染「重试」与「如何解决」两个按钮', () => {
    wrapper = mount(ConnectionWarning)
    expect(find(wrapper, 'retry-btn').exists()).toBe(true)
    expect(find(wrapper, 'help-btn').exists()).toBe(true)
    expect(find(wrapper, 'retry-btn').text()).toBe('重试')
    expect(find(wrapper, 'help-btn').text()).toBe('如何解决')
  })
})

describe('ConnectionWarning · 交互', () => {
  it('点击「重试」emit retry', async () => {
    wrapper = mount(ConnectionWarning)
    await find(wrapper, 'retry-btn').trigger('click')

    expect(wrapper.emitted('retry')).toHaveLength(1)
  })

  it('点击「如何解决」emit help', async () => {
    wrapper = mount(ConnectionWarning)
    await find(wrapper, 'help-btn').trigger('click')

    expect(wrapper.emitted('help')).toHaveLength(1)
  })

  it('重试不会顺带触发 help', async () => {
    wrapper = mount(ConnectionWarning)
    await find(wrapper, 'retry-btn').trigger('click')

    expect(wrapper.emitted('help')).toBeFalsy()
  })
})

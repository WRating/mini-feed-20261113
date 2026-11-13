/**
 * PostComposer 组件测试（TDD）
 * 黑盒：只通过 DOM 交互与 emit 断言行为，不碰内部实现细节。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import PostComposer from './PostComposer.vue'
import { MAX_LEN } from '@/utils/post'

const find = (wrapper, testid) => wrapper.find(`[data-testid="${testid}"]`)

let wrapper

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  wrapper?.unmount()
})

describe('PostComposer · 渲染', () => {
  it('渲染输入框与发布按钮', () => {
    wrapper = mount(PostComposer)
    expect(find(wrapper, 'composer-input').exists()).toBe(true)
    expect(find(wrapper, 'publish-btn').exists()).toBe(true)
  })

  it('初始状态计数为 0 / 280，按钮禁用', () => {
    wrapper = mount(PostComposer)
    expect(find(wrapper, 'char-counter').text()).toBe(`0 / ${MAX_LEN}`)
    expect(find(wrapper, 'publish-btn').attributes('disabled')).toBeDefined()
  })

  it('输入框有 maxlength 限制', () => {
    wrapper = mount(PostComposer)
    expect(find(wrapper, 'composer-input').attributes('maxlength')).toBe(String(MAX_LEN))
  })
})

describe('PostComposer · 交互', () => {
  it('输入内容后按钮可用，计数同步', async () => {
    wrapper = mount(PostComposer)
    await find(wrapper, 'composer-input').setValue('你好')

    expect(find(wrapper, 'char-counter').text()).toBe(`2 / ${MAX_LEN}`)
    expect(find(wrapper, 'publish-btn').attributes('disabled')).toBeUndefined()
  })

  it('纯空白内容按钮保持禁用', async () => {
    wrapper = mount(PostComposer)
    await find(wrapper, 'composer-input').setValue('    ')
    expect(find(wrapper, 'publish-btn').attributes('disabled')).toBeDefined()
  })

  it('点击发布 emit submit 并带上内容', async () => {
    wrapper = mount(PostComposer)
    await find(wrapper, 'composer-input').setValue('  要发布的内容  ')
    await find(wrapper, 'publish-btn').trigger('click')

    expect(wrapper.emitted('submit')).toBeTruthy()
    expect(wrapper.emitted('submit')[0][0]).toBe('要发布的内容')
  })

  it('Ctrl + Enter 触发发布', async () => {
    wrapper = mount(PostComposer)
    await find(wrapper, 'composer-input').setValue('快捷键发布')
    await find(wrapper, 'composer-input').trigger('keydown', { key: 'Enter', ctrlKey: true })

    expect(wrapper.emitted('submit')).toBeTruthy()
  })

  it('Cmd + Enter 也触发发布（macOS）', async () => {
    wrapper = mount(PostComposer)
    await find(wrapper, 'composer-input').setValue('mac 快捷键')
    await find(wrapper, 'composer-input').trigger('keydown', { key: 'Enter', metaKey: true })

    expect(wrapper.emitted('submit')).toBeTruthy()
  })

  it('单独 Enter 不触发发布（允许换行）', async () => {
    wrapper = mount(PostComposer)
    await find(wrapper, 'composer-input').setValue('多行内容')
    await find(wrapper, 'composer-input').trigger('keydown', { key: 'Enter' })

    expect(wrapper.emitted('submit')).toBeFalsy()
  })

  it('内容为空时 Ctrl+Enter 不 emit', async () => {
    wrapper = mount(PostComposer)
    await find(wrapper, 'composer-input').trigger('keydown', { key: 'Enter', ctrlKey: true })
    expect(wrapper.emitted('submit')).toBeFalsy()
  })
})

describe('PostComposer · 发布成功后的行为', () => {
  it('提交后清空输入框并复位计数', async () => {
    wrapper = mount(PostComposer)
    await find(wrapper, 'composer-input').setValue('发布完要清空')
    await find(wrapper, 'publish-btn').trigger('click')

    expect(find(wrapper, 'composer-input').element.value).toBe('')
    expect(find(wrapper, 'char-counter').text()).toBe(`0 / ${MAX_LEN}`)
    expect(find(wrapper, 'publish-btn').attributes('disabled')).toBeDefined()
  })

  it('接近上限时计数区给出提醒样式', async () => {
    wrapper = mount(PostComposer)
    await find(wrapper, 'composer-input').setValue('a'.repeat(MAX_LEN - 5))
    expect(find(wrapper, 'char-counter').classes()).toContain('is-near-limit')
  })

  it('正常长度不显示提醒样式', async () => {
    wrapper = mount(PostComposer)
    await find(wrapper, 'composer-input').setValue('短内容')
    expect(find(wrapper, 'char-counter').classes()).not.toContain('is-near-limit')
  })
})

describe('PostComposer · 外部状态', () => {
  it('disabled 状态下按钮不可点', () => {
    wrapper = mount(PostComposer, { props: { disabled: true } })
    expect(find(wrapper, 'publish-btn').attributes('disabled')).toBeDefined()
  })

  it('可预填初始内容', () => {
    wrapper = mount(PostComposer, { props: { initialText: '草稿内容' } })
    expect(find(wrapper, 'composer-input').element.value).toBe('草稿内容')
  })

  it('暴露 focus 方法供父组件调用', () => {
    wrapper = mount(PostComposer)
    expect(typeof wrapper.vm.focus).toBe('function')
  })
})

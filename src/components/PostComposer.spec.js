/**
 * PostComposer 组件测试（TDD）
 * 黑盒：只通过 DOM 交互与 emit 断言行为，不碰内部实现细节。
 *
 * 发布改成 HTTP 之后，本组件是「受控异步」的：
 * 提交只上报意图，清空由父组件在请求成功后再调用 clear() 完成。
 * 因此这里最关键的不变量是——提交后输入框内容必须还在，否则请求失败就丢字。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { nextTick } from 'vue'
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

  it('点击发布 emit submit 并带上 trim 后的内容', async () => {
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

describe('PostComposer · 受控异步（提交不清空）', () => {
  it('提交后输入框内容仍在——请求失败不能丢用户的字', async () => {
    wrapper = mount(PostComposer)
    await find(wrapper, 'composer-input').setValue('发布完仍要留在框里')
    await find(wrapper, 'publish-btn').trigger('click')

    expect(wrapper.emitted('submit')[0][0]).toBe('发布完仍要留在框里')
    expect(find(wrapper, 'composer-input').element.value).toBe('发布完仍要留在框里')
    expect(find(wrapper, 'char-counter').text()).toBe(`9 / ${MAX_LEN}`)
  })

  it('Ctrl + Enter 提交后同样保留内容', async () => {
    wrapper = mount(PostComposer)
    await find(wrapper, 'composer-input').setValue('快捷键也不清空')
    await find(wrapper, 'composer-input').trigger('keydown', { key: 'Enter', ctrlKey: true })

    expect(find(wrapper, 'composer-input').element.value).toBe('快捷键也不清空')
  })

  it('clear() 能清空输入框并复位计数与按钮状态', async () => {
    wrapper = mount(PostComposer)
    await find(wrapper, 'composer-input').setValue('待清空的内容')

    wrapper.vm.clear()
    await nextTick()

    expect(find(wrapper, 'composer-input').element.value).toBe('')
    expect(find(wrapper, 'char-counter').text()).toBe(`0 / ${MAX_LEN}`)
    expect(find(wrapper, 'publish-btn').attributes('disabled')).toBeDefined()
  })

  it('暴露 clear 方法供父组件在请求成功后调用', () => {
    wrapper = mount(PostComposer)
    expect(typeof wrapper.vm.clear).toBe('function')
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

describe('PostComposer · pending（请求进行中）', () => {
  it('pending 时按钮禁用且文案变为「发布中…」', async () => {
    wrapper = mount(PostComposer, { props: { pending: true } })
    await find(wrapper, 'composer-input').setValue('请求进行中')

    const btn = find(wrapper, 'publish-btn')
    expect(btn.attributes('disabled')).toBeDefined()
    expect(btn.text()).toBe('发布中…')
  })

  it('非 pending 时按钮文案是「发布」', async () => {
    wrapper = mount(PostComposer, { props: { pending: false } })
    await find(wrapper, 'composer-input').setValue('普通状态')

    expect(find(wrapper, 'publish-btn').text()).toBe('发布')
  })

  it('pending 时点击按钮不 emit submit', async () => {
    wrapper = mount(PostComposer, { props: { pending: true } })
    await find(wrapper, 'composer-input').setValue('重复点击防抖')
    await find(wrapper, 'publish-btn').trigger('click')

    expect(wrapper.emitted('submit')).toBeFalsy()
  })

  it('pending 时 Ctrl + Enter 不触发提交', async () => {
    wrapper = mount(PostComposer, { props: { pending: true } })
    await find(wrapper, 'composer-input').setValue('快捷键也要挡住')
    await find(wrapper, 'composer-input').trigger('keydown', { key: 'Enter', ctrlKey: true })

    expect(wrapper.emitted('submit')).toBeFalsy()
  })

  it('pending 时 Cmd + Enter 不触发提交', async () => {
    wrapper = mount(PostComposer, { props: { pending: true } })
    await find(wrapper, 'composer-input').setValue('mac 快捷键也要挡住')
    await find(wrapper, 'composer-input').trigger('keydown', { key: 'Enter', metaKey: true })

    expect(wrapper.emitted('submit')).toBeFalsy()
  })

  it('pending 结束后恢复可发布', async () => {
    wrapper = mount(PostComposer, { props: { pending: true } })
    await find(wrapper, 'composer-input').setValue('请求完成')
    expect(find(wrapper, 'publish-btn').attributes('disabled')).toBeDefined()

    await wrapper.setProps({ pending: false })
    expect(find(wrapper, 'publish-btn').attributes('disabled')).toBeUndefined()
    expect(find(wrapper, 'publish-btn').text()).toBe('发布')

    await find(wrapper, 'publish-btn').trigger('click')
    expect(wrapper.emitted('submit')).toHaveLength(1)
  })

  it('pending 时输入框仍可继续编辑（不锁死草稿）', async () => {
    wrapper = mount(PostComposer, { props: { pending: true } })
    await find(wrapper, 'composer-input').setValue('边等边改')

    expect(find(wrapper, 'composer-input').element.value).toBe('边等边改')
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

/**
 * PostDetail 组件测试（TDD）
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import PostDetail from './PostDetail.vue'

const NOW = new Date(2026, 10, 13, 10, 0, 0).getTime()
const find = (wrapper, testid) => wrapper.find(`[data-testid="${testid}"]`)

const post = { id: 'p1', text: '详情正文', createdAt: NOW - 3600_000 }
const author = { name: '小记', avatar: '🦊' }

let wrapper

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  wrapper?.unmount()
})

describe('PostDetail · 渲染', () => {
  it('显示完整正文', () => {
    wrapper = mount(PostDetail, { props: { post, author } })
    expect(find(wrapper, 'detail-text').text()).toBe('详情正文')
  })

  it('显示精确到分钟的时间', () => {
    wrapper = mount(PostDetail, { props: { post, author } })
    expect(find(wrapper, 'detail-time').text()).toBe('2026-11-13 09:00')
  })

  it('显示字数', () => {
    wrapper = mount(PostDetail, { props: { post, author } })
    expect(find(wrapper, 'detail-chars').text()).toContain('4')
    expect(find(wrapper, 'detail-chars').text()).toContain('字')
  })

  it('显示作者信息', () => {
    wrapper = mount(PostDetail, { props: { post, author } })
    expect(find(wrapper, 'detail-author').text()).toBe('小记')
    expect(find(wrapper, 'detail-avatar').text()).toBe('🦊')
  })

  it('缺少 author 时用兜底值，不报错', () => {
    wrapper = mount(PostDetail, { props: { post } })
    expect(find(wrapper, 'detail-author').text()).toBe('我')
  })

  it('多行内容保持换行', () => {
    wrapper = mount(PostDetail, { props: { post: { ...post, text: '第一行\n第二行' }, author } })
    expect(find(wrapper, 'detail-text').element.textContent).toBe('第一行\n第二行')
  })

  it('HTML 按纯文本渲染，不产生元素', () => {
    wrapper = mount(PostDetail, { props: { post: { ...post, text: '<b>x</b>' }, author } })
    expect(wrapper.findAll('b')).toHaveLength(0)
    expect(find(wrapper, 'detail-text').text()).toBe('<b>x</b>')
  })
})

describe('PostDetail · 交互', () => {
  it('点击返回 emit back', async () => {
    wrapper = mount(PostDetail, { props: { post, author } })
    const backBtn = wrapper.findAll('button').find((b) => b.text().includes('返回'))

    await backBtn.trigger('click')
    expect(wrapper.emitted('back')).toHaveLength(1)
  })

  it('点击删除 emit remove 并带上 id', async () => {
    wrapper = mount(PostDetail, { props: { post, author } })
    await find(wrapper, 'delete-btn').trigger('click')

    expect(wrapper.emitted('remove')[0][0]).toBe('p1')
  })

  it('removable 为 false 时不显示删除', () => {
    wrapper = mount(PostDetail, { props: { post, author, removable: false } })
    expect(find(wrapper, 'delete-btn').exists()).toBe(false)
  })
})

describe('PostDetail · 缺失数据', () => {
  it('post 为 null 时显示提示而非崩溃', () => {
    wrapper = mount(PostDetail, { props: { post: null, author } })
    expect(find(wrapper, 'detail-missing').exists()).toBe(true)
    expect(find(wrapper, 'detail-text').exists()).toBe(false)
  })

  it('post 为 null 时仍可返回', async () => {
    wrapper = mount(PostDetail, { props: { post: null, author } })
    const backBtn = wrapper.findAll('button').find((b) => b.text().includes('返回'))

    await backBtn.trigger('click')
    expect(wrapper.emitted('back')).toHaveLength(1)
  })
})

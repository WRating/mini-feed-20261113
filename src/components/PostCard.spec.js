/**
 * PostCard 组件测试（TDD）
 * 卡片只负责展示与「意图上报」，删除/打开的决策权在父级。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import PostCard from './PostCard.vue'

const NOW = new Date(2026, 10, 13, 10, 0, 0).getTime()
const find = (wrapper, testid) => wrapper.find(`[data-testid="${testid}"]`)

const basePost = { id: 'p1', text: '一条动态', createdAt: NOW - 5 * 60_000 }
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

describe('PostCard · 渲染', () => {
  it('显示正文、作者昵称与头像', () => {
    wrapper = mount(PostCard, { props: { post: basePost, author } })
    expect(find(wrapper, 'post-text').text()).toBe('一条动态')
    expect(find(wrapper, 'post-author').text()).toBe('小记')
    expect(find(wrapper, 'post-avatar').text()).toBe('🦊')
  })

  it('显示相对时间', () => {
    wrapper = mount(PostCard, { props: { post: basePost, author } })
    expect(find(wrapper, 'post-time').text()).toBe('5 分钟前')
  })

  it('缺少 author 时给出兜底展示，不报错', () => {
    wrapper = mount(PostCard, { props: { post: basePost } })
    expect(find(wrapper, 'post-author').text()).toBe('我')
    expect(find(wrapper, 'post-avatar').text()).toBeTruthy()
  })

  it('多行内容保持换行（使用纯文本渲染，不解析 HTML）', () => {
    const post = { ...basePost, text: '第一行\n第二行' }
    wrapper = mount(PostCard, { props: { post, author } })

    const el = find(wrapper, 'post-text').element
    expect(el.textContent).toBe('第一行\n第二行')
  })

  it('HTML 标签按纯文本显示，不产生元素（防 XSS）', () => {
    const post = { ...basePost, text: '<img src=x onerror=alert(1)>' }
    wrapper = mount(PostCard, { props: { post, author } })

    expect(wrapper.findAll('img')).toHaveLength(0)
    expect(find(wrapper, 'post-text').text()).toBe('<img src=x onerror=alert(1)>')
  })
})

describe('PostCard · 交互', () => {
  it('点击「查看详情」emit open 并带上 id', async () => {
    wrapper = mount(PostCard, { props: { post: basePost, author } })
    await find(wrapper, 'open-btn').trigger('click')

    expect(wrapper.emitted('open')[0][0]).toBe('p1')
  })

  it('点击卡片主体也 emit open', async () => {
    wrapper = mount(PostCard, { props: { post: basePost, author } })
    await find(wrapper, 'post-body').trigger('click')

    expect(wrapper.emitted('open')).toBeTruthy()
  })

  it('点击删除 emit remove 并带上 id', async () => {
    wrapper = mount(PostCard, { props: { post: basePost, author } })
    await find(wrapper, 'delete-btn').trigger('click')

    expect(wrapper.emitted('remove')[0][0]).toBe('p1')
  })

  it('阅读模式下不显示删除按钮', () => {
    wrapper = mount(PostCard, { props: { post: basePost, author, removable: false } })
    expect(find(wrapper, 'delete-btn').exists()).toBe(false)
  })

  it('高亮状态下带 is-new 类', () => {
    wrapper = mount(PostCard, { props: { post: basePost, author, highlight: true } })
    expect(find(wrapper, 'post-card').classes()).toContain('is-new')
  })
})

describe('PostCard · 可访问性', () => {
  it('卡片主体可聚焦并响应键盘回车', async () => {
    wrapper = mount(PostCard, { props: { post: basePost, author } })
    const body = find(wrapper, 'post-body')

    expect(body.attributes('tabindex')).toBe('0')
    await body.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('open')).toBeTruthy()
  })

  it('删除按钮带有可读的 aria-label', () => {
    wrapper = mount(PostCard, { props: { post: basePost, author } })
    expect(find(wrapper, 'delete-btn').attributes('aria-label')).toBe('删除这条动态')
  })
})

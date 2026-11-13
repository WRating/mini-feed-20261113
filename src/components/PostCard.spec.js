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

describe('PostCard · 互动按钮', () => {
  const reactedPost = { ...basePost, likes: 1, favorites: 1, liked: true, favorited: true }

  it('渲染点赞与收藏按钮及其计数', () => {
    wrapper = mount(PostCard, { props: { post: reactedPost, author } })

    expect(find(wrapper, 'like-count').text()).toBe('1')
    expect(find(wrapper, 'favorite-count').text()).toBe('1')
  })

  it('互动字段缺失时计数按 0 显示（兼容旧数据）', () => {
    wrapper = mount(PostCard, { props: { post: basePost, author } })

    expect(find(wrapper, 'like-count').text()).toBe('0')
    expect(find(wrapper, 'favorite-count').text()).toBe('0')
  })

  it('已点赞 / 已收藏时带 is-active 选中态', () => {
    wrapper = mount(PostCard, { props: { post: reactedPost, author } })

    expect(find(wrapper, 'like-btn').classes()).toContain('is-active')
    expect(find(wrapper, 'favorite-btn').classes()).toContain('is-active')
  })

  it('未互动时没有 is-active', () => {
    wrapper = mount(PostCard, { props: { post: basePost, author } })

    expect(find(wrapper, 'like-btn').classes()).not.toContain('is-active')
    expect(find(wrapper, 'favorite-btn').classes()).not.toContain('is-active')
  })

  it('点击点赞 emit like 并带上 post id', async () => {
    wrapper = mount(PostCard, { props: { post: basePost, author } })
    await find(wrapper, 'like-btn').trigger('click')

    expect(wrapper.emitted('like')[0][0]).toBe('p1')
  })

  it('点击收藏 emit favorite 并带上 post id', async () => {
    wrapper = mount(PostCard, { props: { post: basePost, author } })
    await find(wrapper, 'favorite-btn').trigger('click')

    expect(wrapper.emitted('favorite')[0][0]).toBe('p1')
  })

  it('组件不直接改状态：点击后 post prop 不变，只上报意图', async () => {
    wrapper = mount(PostCard, { props: { post: basePost, author } })
    await find(wrapper, 'like-btn').trigger('click')

    expect(wrapper.props('post')).toEqual(basePost)
    expect(find(wrapper, 'like-count').text()).toBe('0')
  })

  it('【防回归】点击互动按钮不会触发「打开详情」', async () => {
    // 卡片主体有点击进详情的行为，按钮必须 @click.stop
    wrapper = mount(PostCard, { props: { post: basePost, author } })
    await find(wrapper, 'like-btn').trigger('click')
    await find(wrapper, 'favorite-btn').trigger('click')

    expect(wrapper.emitted('open')).toBeFalsy()
  })

  it('请求进行中时两个按钮都禁用', () => {
    wrapper = mount(PostCard, { props: { post: basePost, author, reacting: true } })

    expect(find(wrapper, 'like-btn').attributes('disabled')).toBeDefined()
    expect(find(wrapper, 'favorite-btn').attributes('disabled')).toBeDefined()
  })

  it('非请求中时按钮可用', () => {
    wrapper = mount(PostCard, { props: { post: basePost, author, reacting: false } })

    expect(find(wrapper, 'like-btn').attributes('disabled')).toBeUndefined()
    expect(find(wrapper, 'favorite-btn').attributes('disabled')).toBeUndefined()
  })

  it('禁用的按钮不会再 emit（避免禁用态仍发出请求意图）', async () => {
    wrapper = mount(PostCard, { props: { post: basePost, author, reacting: true } })
    await find(wrapper, 'like-btn').trigger('click')

    expect(wrapper.emitted('like')).toBeFalsy()
  })
})

describe('PostCard · 互动按钮可访问性', () => {
  const reactedPost = { ...basePost, likes: 1, favorites: 1, liked: true, favorited: true }

  it('未互动时 aria-pressed 为 false，且 aria-label 说明可点击', () => {
    wrapper = mount(PostCard, { props: { post: basePost, author } })

    expect(find(wrapper, 'like-btn').attributes('aria-pressed')).toBe('false')
    expect(find(wrapper, 'like-btn').attributes('aria-label')).toContain('点赞')
    expect(find(wrapper, 'favorite-btn').attributes('aria-pressed')).toBe('false')
    expect(find(wrapper, 'favorite-btn').attributes('aria-label')).toContain('收藏')
  })

  it('已互动时 aria-pressed 为 true，aria-label 说明可取消', () => {
    wrapper = mount(PostCard, { props: { post: reactedPost, author } })

    expect(find(wrapper, 'like-btn').attributes('aria-pressed')).toBe('true')
    expect(find(wrapper, 'favorite-btn').attributes('aria-pressed')).toBe('true')
    expect(find(wrapper, 'like-btn').attributes('aria-label')).toContain('取消')
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

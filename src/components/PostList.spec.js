/**
 * PostList 组件测试（TDD）
 * 列表负责「空状态 / 逐条渲染 / 事件透传」，不做数据裁剪。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import PostList from './PostList.vue'
import PostCard from './PostCard.vue'

const NOW = new Date(2026, 10, 13, 10, 0, 0).getTime()
const find = (wrapper, testid) => wrapper.find(`[data-testid="${testid}"]`)

const author = { name: '小记', avatar: '🦊' }
const posts = [
  { id: 'p2', text: '第二条', createdAt: NOW - 60_000 },
  { id: 'p1', text: '第一条', createdAt: NOW - 120_000 }
]

let wrapper

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  wrapper?.unmount()
})

describe('PostList · 渲染', () => {
  it('按传入顺序逐条渲染卡片', () => {
    wrapper = mount(PostList, { props: { posts, author } })
    const cards = wrapper.findAllComponents(PostCard)

    expect(cards).toHaveLength(2)
    expect(cards[0].props('post').id).toBe('p2')
    expect(cards[1].props('post').id).toBe('p1')
  })

  it('把 author 透传给每张卡片', () => {
    wrapper = mount(PostList, { props: { posts, author } })
    expect(wrapper.findAllComponents(PostCard)[0].props('author')).toEqual(author)
  })

  it('高亮指定 id 对应的卡片', () => {
    wrapper = mount(PostList, { props: { posts, author, highlightId: 'p1' } })
    const cards = wrapper.findAllComponents(PostCard)

    expect(cards[0].props('highlight')).toBe(false)
    expect(cards[1].props('highlight')).toBe(true)
  })

  it('列表为空时显示空状态文案', () => {
    wrapper = mount(PostList, { props: { posts: [], author } })
    expect(find(wrapper, 'empty-state').exists()).toBe(true)
    expect(find(wrapper, 'empty-state').text()).toContain('还没有动态')
  })

  it('有数据时不显示空状态', () => {
    wrapper = mount(PostList, { props: { posts, author } })
    expect(find(wrapper, 'empty-state').exists()).toBe(false)
  })

  it('可自定义空状态文案（我的动态用不同提示）', () => {
    wrapper = mount(PostList, {
      props: { posts: [], author, emptyTitle: '你还没有发布过动态' }
    })
    expect(find(wrapper, 'empty-state').text()).toContain('你还没有发布过动态')
  })

  it('removable 为 false 时卡片也不显示删除', () => {
    wrapper = mount(PostList, { props: { posts, author, removable: false } })
    expect(wrapper.findAllComponents(PostCard)[0].props('removable')).toBe(false)
  })

  it('isReacting 谓词只让对应卡片处于请求中状态', () => {
    // 用谓词而不是单个 id：store 允许「不同动态同时请求」，
    // 传单个 id 会在两条同时请求时漏掉其中一条的禁用态。
    wrapper = mount(PostList, {
      props: { posts, author, isReacting: (id) => id === 'p1' }
    })
    const cards = wrapper.findAllComponents(PostCard)

    expect(cards[0].props('reacting')).toBe(false)
    expect(cards[1].props('reacting')).toBe(true)
  })

  it('多条动态同时请求中时各自的禁用态互不干扰', () => {
    wrapper = mount(PostList, {
      props: { posts, author, isReacting: () => true }
    })
    const cards = wrapper.findAllComponents(PostCard)

    expect(cards[0].props('reacting')).toBe(true)
    expect(cards[1].props('reacting')).toBe(true)
  })

  it('未传 isReacting 时所有卡片都不处于请求中', () => {
    wrapper = mount(PostList, { props: { posts, author } })
    expect(wrapper.findAllComponents(PostCard).every((c) => c.props('reacting') === false)).toBe(true)
  })
})

describe('PostList · 事件透传', () => {
  it('卡片 open 事件向上转发，带 id', async () => {
    wrapper = mount(PostList, { props: { posts, author } })
    await wrapper.findAllComponents(PostCard)[0].vm.$emit('open', 'p2')

    expect(wrapper.emitted('open')[0][0]).toBe('p2')
  })

  it('卡片 remove 事件向上转发，带 id', async () => {
    wrapper = mount(PostList, { props: { posts, author } })
    await wrapper.findAllComponents(PostCard)[1].vm.$emit('remove', 'p1')

    expect(wrapper.emitted('remove')[0][0]).toBe('p1')
  })

  it('卡片 like 事件向上转发，带 id', async () => {
    wrapper = mount(PostList, { props: { posts, author } })
    await wrapper.findAllComponents(PostCard)[0].vm.$emit('like', 'p2')

    expect(wrapper.emitted('like')[0][0]).toBe('p2')
  })

  it('卡片 favorite 事件向上转发，带 id', async () => {
    wrapper = mount(PostList, { props: { posts, author } })
    await wrapper.findAllComponents(PostCard)[1].vm.$emit('favorite', 'p1')

    expect(wrapper.emitted('favorite')[0][0]).toBe('p1')
  })
})

/**
 * posts store 测试（TDD）
 *
 * 关注点：
 * - 状态唯一来源是 store；持久化通过注入的 storage 完成（构造时可替换，便于测试）
 * - 发布 / 删除 / 查询 / 统计 都是 action
 * - 读取脏数据要能自愈（过滤非法条目），不能白屏
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePostsStore } from './posts'
import { createStorage } from '@/services/storage'
import { setStorage } from '@/services/storage-context'
import { MAX_LEN } from '@/utils/post'

const NOW = new Date(2026, 10, 13, 10, 0, 0).getTime()

let storage

beforeEach(() => {
  setActivePinia(createPinia())
  storage = createStorage()
  // 每个用例用全新的存储实例，彼此隔离
  setStorage(storage)
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  setStorage(null)
})

describe('posts store · 初始状态', () => {
  it('没有历史数据时为空数组，计数为 0', () => {
    const store = usePostsStore()
    expect(store.posts).toEqual([])
    expect(store.count).toBe(0)
    expect(store.isEmpty).toBe(true)
  })

  it('从 storage 恢复已有动态，并按时间倒序', () => {
    storage.write(
      'posts',
      JSON.stringify([
        { id: 'a', text: 'old', createdAt: 1 },
        { id: 'b', text: 'new', createdAt: 9 }
      ])
    )
    const store = usePostsStore()
    expect(store.posts.map((p) => p.id)).toEqual(['b', 'a'])
    expect(store.count).toBe(2)
    expect(store.isEmpty).toBe(false)
  })

  it('历史数据损坏时自愈为空，不抛错', () => {
    storage.write('posts', '{不是数组')
    expect(() => usePostsStore()).not.toThrow()
    expect(usePostsStore().posts).toEqual([])
  })

  it('历史数据中混有非法条目时只保留合法的', () => {
    storage.write(
      'posts',
      JSON.stringify([
        { id: 'a', text: 'ok', createdAt: 1 },
        { text: 123, createdAt: 2 },
        null,
        { id: 'c', text: 'ok2', createdAt: 3 }
      ])
    )
    const store = usePostsStore()
    expect(store.posts.map((p) => p.id)).toEqual(['c', 'a'])
  })

  it('storage 为空值（null）时也能正常初始化', () => {
    storage.write('posts', 'null')
    expect(usePostsStore().posts).toEqual([])
  })
})

describe('posts store · publish', () => {
  it('发布后写入列表头部并持久化', () => {
    const store = usePostsStore()
    const result = store.publish('  第一条动态  ')

    expect(result.ok).toBe(true)
    expect(store.count).toBe(1)
    expect(store.posts[0].text).toBe('第一条动态')
    expect(JSON.parse(storage.read('posts'))).toHaveLength(1)
  })

  it('多条动态按发布时间倒序（新的在前）', () => {
    const store = usePostsStore()
    store.publish('第一条')
    vi.setSystemTime(NOW + 1000)
    store.publish('第二条')
    vi.setSystemTime(NOW + 2000)
    store.publish('第三条')

    expect(store.posts.map((p) => p.text)).toEqual(['第三条', '第二条', '第一条'])
  })

  it('空内容被拒绝且不写入', () => {
    const store = usePostsStore()
    expect(store.publish('').ok).toBe(false)
    expect(store.publish('   ').ok).toBe(false)
    expect(store.count).toBe(0)
    expect(storage.read('posts')).toBeNull()
  })

  it('超过 280 字被拒绝，并返回可读原因', () => {
    const store = usePostsStore()
    const result = store.publish('a'.repeat(MAX_LEN + 1))
    expect(result.ok).toBe(false)
    expect(result.error).toContain('280')
    expect(store.count).toBe(0)
  })

  it('恰好 280 字可以发布', () => {
    const store = usePostsStore()
    expect(store.publish('a'.repeat(MAX_LEN)).ok).toBe(true)
  })

  it('记录最近一次发布的 id（供 UI 高亮）', () => {
    const store = usePostsStore()
    const { post } = store.publish('高亮我')
    expect(store.lastPublishedId).toBe(post.id)
  })
})

describe('posts store · remove', () => {
  it('按 id 删除并同步持久化', () => {
    const store = usePostsStore()
    const { post } = store.publish('要删的')
    store.publish('保留的')

    expect(store.remove(post.id)).toBe(true)
    expect(store.count).toBe(1)
    expect(store.posts[0].text).toBe('保留的')
    expect(JSON.parse(storage.read('posts'))).toHaveLength(1)
  })

  it('删除不存在的 id 返回 false 且不影响数据', () => {
    const store = usePostsStore()
    store.publish('保留的')
    expect(store.remove('not-exist')).toBe(false)
    expect(store.count).toBe(1)
  })

  it('删除最后一条后回到空状态', () => {
    const store = usePostsStore()
    const { post } = store.publish('唯一一条')
    store.remove(post.id)
    expect(store.isEmpty).toBe(true)
    expect(JSON.parse(storage.read('posts'))).toEqual([])
  })
})

describe('posts store · 查询与统计', () => {
  it('getById 命中返回动态，未命中返回 undefined', () => {
    const store = usePostsStore()
    const { post } = store.publish('找得到')
    expect(store.getById(post.id).text).toBe('找得到')
    expect(store.getById('nope')).toBeUndefined()
  })

  it('totalChars 统计所有动态的字符数', () => {
    const store = usePostsStore()
    store.publish('abc')
    store.publish('de')
    expect(store.totalChars).toBe(5)
  })

  it('totalChars 为空时为 0', () => {
    expect(usePostsStore().totalChars).toBe(0)
  })
})

describe('posts store · clear', () => {
  it('清空后列表为空且持久化为空数组', () => {
    const store = usePostsStore()
    store.publish('a')
    store.publish('b')
    store.clear()

    expect(store.posts).toEqual([])
    expect(store.lastPublishedId).toBeNull()
    expect(JSON.parse(storage.read('posts'))).toEqual([])
  })
})

describe('posts store · 合并导入', () => {
  it('merge 按「内容+时间」去重后合并', () => {
    const store = usePostsStore()
    store.publish('已存在')

    const existing = store.posts[0]
    const result = store.merge([
      { id: existing.id, text: existing.text, createdAt: existing.createdAt },
      { id: 'new-1', text: '导入的新动态', createdAt: NOW + 5000 }
    ])

    expect(result.added).toBe(1)
    expect(result.skipped).toBe(1)
    expect(store.count).toBe(2)
  })

  it('merge 结果按时间倒序', () => {
    const store = usePostsStore()
    store.publish('本地')
    store.merge([{ id: 'future', text: '来自备份', createdAt: NOW + 10_000 }])
    expect(store.posts[0].text).toBe('来自备份')
  })

  it('merge 非法条目被跳过并计数', () => {
    const store = usePostsStore()
    const result = store.merge([{ text: 'ok', createdAt: 1 }, { foo: 'bar' }, null])
    expect(result.added).toBe(1)
    expect(result.skipped).toBe(2)
  })

  it('merge 空数组不报错', () => {
    const store = usePostsStore()
    expect(store.merge([])).toEqual({ added: 0, skipped: 0 })
  })

  it('merge 非数组入参不报错', () => {
    const store = usePostsStore()
    expect(store.merge(null)).toEqual({ added: 0, skipped: 0 })
  })
})

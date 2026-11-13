/**
 * 动态实体工具测试（TDD）
 * 负责：id 生成、内容规范化、长度校验、排序、去重 —— 纯函数，无 Vue 依赖。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  MAX_LEN,
  createPost,
  normalizeText,
  canPublish,
  isValidPost,
  sortByCreatedAtDesc,
  dedupeKey,
  isDuplicate
} from './post'

const NOW = new Date(2026, 10, 13, 10, 0, 0).getTime()

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('normalizeText', () => {
  it('去掉首尾空白', () => {
    expect(normalizeText('  hello  ')).toBe('hello')
  })

  it('非字符串输入返回空串', () => {
    expect(normalizeText(null)).toBe('')
    expect(normalizeText(undefined)).toBe('')
    expect(normalizeText(123)).toBe('')
  })
})

describe('MAX_LEN 与 canPublish', () => {
  it('上限为 280', () => {
    expect(MAX_LEN).toBe(280)
  })

  it('空内容或纯空白不可发布', () => {
    expect(canPublish('')).toBe(false)
    expect(canPublish('   ')).toBe(false)
    expect(canPublish('\n\t ')).toBe(false)
  })

  it('有内容可发布', () => {
    expect(canPublish('a')).toBe(true)
    expect(canPublish('  hi  ')).toBe(true)
  })

  it('超过上限不可发布（以 trim 后的长度计）', () => {
    expect(canPublish('a'.repeat(280))).toBe(true)
    expect(canPublish('a'.repeat(281))).toBe(false)
    // trim 后正好 280，应当允许
    expect(canPublish(`  ${'a'.repeat(280)}  `)).toBe(true)
  })

  it('非字符串输入不可发布', () => {
    expect(canPublish(null)).toBe(false)
    expect(canPublish(undefined)).toBe(false)
  })
})

describe('createPost', () => {
  it('把内容 trim 后入库，并带 id 与 createdAt', () => {
    const post = createPost('  你好  ')
    expect(post.text).toBe('你好')
    expect(post.createdAt).toBe(NOW)
    expect(typeof post.id).toBe('string')
    expect(post.id.length).toBeGreaterThan(0)
  })

  it('长度超过上限时截断到 280，不抛错', () => {
    const post = createPost('a'.repeat(500))
    expect(post.text.length).toBe(MAX_LEN)
  })

  it('连续创建不会产生重复 id', () => {
    const ids = new Set()
    for (let i = 0; i < 200; i += 1) ids.add(createPost(`内容 ${i}`).id)
    expect(ids.size).toBe(200)
  })

  it('允许注入 id 与 createdAt（便于测试与导入）', () => {
    const post = createPost('x', { id: 'fixed-id', createdAt: 123 })
    expect(post).toEqual({ id: 'fixed-id', text: 'x', createdAt: 123 })
  })
})

describe('isValidPost', () => {
  it('校验通过：含字符串 text 与数字 createdAt', () => {
    expect(isValidPost({ id: 'a', text: 'hi', createdAt: 1 })).toBe(true)
  })

  it('拒绝缺少字段或类型不符的对象', () => {
    expect(isValidPost(null)).toBe(false)
    expect(isValidPost({})).toBe(false)
    expect(isValidPost({ text: 'hi' })).toBe(false)
    expect(isValidPost({ text: 123, createdAt: 1 })).toBe(false)
    expect(isValidPost({ text: 'hi', createdAt: '1' })).toBe(false)
  })

  it('拒绝未知的 createdAt（NaN）', () => {
    expect(isValidPost({ text: 'hi', createdAt: NaN })).toBe(false)
    expect(isValidPost({ text: 'hi', createdAt: Infinity })).toBe(false)
  })
})

describe('sortByCreatedAtDesc', () => {
  it('按时间倒序，且不修改原数组', () => {
    const list = [
      { id: 'a', text: 'a', createdAt: 100 },
      { id: 'b', text: 'b', createdAt: 300 },
      { id: 'c', text: 'c', createdAt: 200 }
    ]
    const snapshot = [...list]
    const sorted = sortByCreatedAtDesc(list)

    expect(sorted.map((p) => p.id)).toEqual(['b', 'c', 'a'])
    expect(list).toEqual(snapshot)
    expect(sorted).not.toBe(list)
  })
})

describe('dedupeKey 与 isDuplicate', () => {
  it('去重键由内容与时间组成', () => {
    expect(dedupeKey({ text: 'hi', createdAt: 1 })).toBe('hi@1')
  })

  it('同内容同时间判为重复', () => {
    const list = [{ id: 'a', text: 'hi', createdAt: 1 }]
    expect(isDuplicate(list, { text: 'hi', createdAt: 1 })).toBe(true)
  })

  it('同内容不同时间不算重复（视为两条独立动态）', () => {
    const list = [{ id: 'a', text: 'hi', createdAt: 1 }]
    expect(isDuplicate(list, { text: 'hi', createdAt: 2 })).toBe(false)
  })

  it('空列表不重复', () => {
    expect(isDuplicate([], { text: 'hi', createdAt: 1 })).toBe(false)
  })
})

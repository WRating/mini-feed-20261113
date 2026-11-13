/**
 * 备份文件解析测试（TDD）
 *
 * 备份文件来自用户手动选择，属于**不可信输入**：
 * 必须能区分「格式错误」「缺字段」「内容全部非法」等情形，并给出可读原因，
 * 且绝不能把脏数据写进 store。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildBackup, parseBackup, BACKUP_VERSION } from './backup'
import { BACKUP_VERSION as SHARED_BACKUP_VERSION } from '@shared/constants'

const NOW = new Date(2026, 10, 13, 10, 0, 0).getTime()

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('buildBackup', () => {
  it('输出稳定的顶层结构', () => {
    const backup = buildBackup({
      posts: [{ id: 'a', text: 'hi', createdAt: 1 }],
      profile: { name: '小记', bio: '简介', avatar: '🦊', joinedAt: 1 }
    })

    expect(Object.keys(backup).sort()).toEqual(
      ['app', 'exportedAt', 'posts', 'profile', 'version'].sort()
    )
    expect(backup.app).toBe('minifeed')
    expect(backup.version).toBe(BACKUP_VERSION)
    expect(backup.exportedAt).toBe(new Date(NOW).toISOString())
    expect(backup.posts).toHaveLength(1)
  })

  it('版本号为 shared/constants 的 BACKUP_VERSION（v2 起带互动字段）', () => {
    // 断言引用同一个真源，而不是各自写死 —— 否则两边升级会静默漂移
    expect(BACKUP_VERSION).toBe(SHARED_BACKUP_VERSION)
    expect(BACKUP_VERSION).toBe(2)
  })

  it('每条动态都带上互动字段（导出即完整快照）', () => {
    const backup = buildBackup({
      posts: [{ id: 'a', text: 'hi', createdAt: 1, likes: 3, favorites: 1, liked: true, favorited: false }]
    })

    expect(backup.posts[0]).toEqual({
      id: 'a',
      text: 'hi',
      createdAt: 1,
      likes: 3,
      favorites: 1,
      liked: true,
      favorited: false
    })
  })

  it('旧数据缺互动字段时导出补 0 / false（不出现 undefined）', () => {
    const backup = buildBackup({ posts: [{ id: 'a', text: 'hi', createdAt: 1 }] })

    expect(backup.posts[0]).toEqual({
      id: 'a',
      text: 'hi',
      createdAt: 1,
      likes: 0,
      favorites: 0,
      liked: false,
      favorited: false
    })
  })

  it('导出时按 shared 规则规范化互动（负数归 0、标记为真抬到 1）', () => {
    const backup = buildBackup({
      posts: [{ id: 'a', text: 'hi', createdAt: 1, likes: -5, liked: true }]
    })

    expect(backup.posts[0].likes).toBe(1)
    expect(backup.posts[0].liked).toBe(true)
  })

  it('深拷贝入参，后续改动不会影响已生成的备份对象', () => {
    const posts = [{ id: 'a', text: 'hi', createdAt: 1 }]
    const backup = buildBackup({ posts, profile: { name: 'x' } })

    posts[0].text = 'changed'
    expect(backup.posts[0].text).toBe('hi')
  })
})

describe('parseBackup · 成功路径', () => {
  it('解析合法文本并返回规范化后的数据', () => {
    const raw = JSON.stringify({
      app: 'minifeed',
      version: 1,
      posts: [
        { id: 'a', text: '  hello  ', createdAt: 2 },
        { id: 'b', text: 'world', createdAt: 1 }
      ],
      profile: { name: '小记', bio: '简介', avatar: '🦊', joinedAt: 5 }
    })

    const result = parseBackup(raw)
    expect(result.ok).toBe(true)
    expect(result.posts.map((p) => p.text)).toEqual(['hello', 'world'])
    expect(result.posts[0].id).toBe('a')
    expect(result.profile.name).toBe('小记')
  })

  it('按时间倒序返回动态', () => {
    const raw = JSON.stringify({
      posts: [
        { id: 'a', text: 'old', createdAt: 1 },
        { id: 'b', text: 'new', createdAt: 99 }
      ]
    })
    expect(parseBackup(raw).posts.map((p) => p.id)).toEqual(['b', 'a'])
  })

  it('缺少 profile 时返回 null（由调用方决定是否使用）', () => {
    const raw = JSON.stringify({ posts: [] })
    const result = parseBackup(raw)
    expect(result.ok).toBe(true)
    expect(result.profile).toBeNull()
  })

  it('资料字段缺失时用默认值补全', () => {
    const raw = JSON.stringify({ posts: [], profile: { name: '只有名字' } })
    const { profile } = parseBackup(raw)
    expect(profile.name).toBe('只有名字')
    expect(typeof profile.bio).toBe('string')
    expect(typeof profile.avatar).toBe('string')
    expect(typeof profile.joinedAt).toBe('number')
  })

  it('超长内容被截断到 280 而不是整条丢弃', () => {
    const raw = JSON.stringify({ posts: [{ id: 'a', text: 'a'.repeat(400), createdAt: 1 }] })
    const result = parseBackup(raw)
    expect(result.posts[0].text).toHaveLength(280)
  })

  it('缺少 id 的动态会自动补一个', () => {
    const raw = JSON.stringify({ posts: [{ text: 'no id', createdAt: 1 }] })
    const result = parseBackup(raw)
    expect(typeof result.posts[0].id).toBe('string')
    expect(result.posts[0].id.length).toBeGreaterThan(0)
  })

  it('同一文件内的重复动态会被去重', () => {
    const raw = JSON.stringify({
      posts: [
        { id: 'a', text: 'dup', createdAt: 1 },
        { id: 'a', text: 'dup', createdAt: 1 }
      ]
    })
    expect(parseBackup(raw).posts).toHaveLength(1)
  })
})

describe('parseBackup · 失败路径', () => {
  it('非 JSON 文本报错', () => {
    const result = parseBackup('这不是 JSON{{')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('JSON')
    expect(result.posts).toEqual([])
  })

  it('空字符串报错', () => {
    expect(parseBackup('').ok).toBe(false)
    expect(parseBackup('   ').ok).toBe(false)
  })

  it('非对象（数组 / 数字 / null）报错', () => {
    expect(parseBackup('[]').ok).toBe(false)
    expect(parseBackup('123').ok).toBe(false)
    expect(parseBackup('null').ok).toBe(false)
    expect(parseBackup('"str"').ok).toBe(false)
  })

  it('缺少 posts 数组时报错', () => {
    const result = parseBackup(JSON.stringify({ foo: 1 }))
    expect(result.ok).toBe(false)
    expect(result.error).toContain('posts')
  })

  it('posts 不是数组时报错', () => {
    const result = parseBackup(JSON.stringify({ posts: 'not-an-array' }))
    expect(result.ok).toBe(false)
    expect(result.error).toContain('posts')
  })

  it('posts 内所有条目都非法时报错', () => {
    const result = parseBackup(JSON.stringify({ posts: [{ foo: 1 }, null, 'x'] }))
    expect(result.ok).toBe(false)
    expect(result.error).toContain('有效')
  })

  it('部分条目非法时保留合法条目并给出跳过数量', () => {
    const raw = JSON.stringify({
      posts: [
        { id: 'a', text: 'ok', createdAt: 1 },
        { foo: 'bad' },
        null
      ]
    })
    const result = parseBackup(raw)
    expect(result.ok).toBe(true)
    expect(result.posts).toHaveLength(1)
    expect(result.skipped).toBe(2)
  })

  it('字符串输入以外的类型也能处理（如已解析的对象）', () => {
    const result = parseBackup({ posts: [{ id: 'a', text: 'obj', createdAt: 1 }] })
    expect(result.ok).toBe(true)
    expect(result.posts[0].text).toBe('obj')
  })
})

describe('parseBackup · 互动字段与版本兼容', () => {
  it('保留 v2 备份里的互动字段', () => {
    const raw = JSON.stringify({
      app: 'minifeed',
      version: 2,
      posts: [
        { id: 'a', text: '已赞', createdAt: 2, likes: 3, favorites: 1, liked: true, favorited: false }
      ]
    })

    const post = parseBackup(raw).posts[0]
    expect(post.likes).toBe(3)
    expect(post.favorites).toBe(1)
    expect(post.liked).toBe(true)
    expect(post.favorited).toBe(false)
  })

  it('【向后兼容】version:1 的旧备份仍能导入，互动按 0 处理', () => {
    // 这是最重要的一条：老用户手里的备份文件必须继续可用
    const raw = JSON.stringify({
      app: 'minifeed',
      version: 1,
      posts: [{ id: 'a', text: '老备份', createdAt: 1 }],
      profile: { name: '老用户' }
    })

    const result = parseBackup(raw)
    expect(result.ok).toBe(true)
    expect(result.posts[0]).toEqual({
      id: 'a',
      text: '老备份',
      createdAt: 1,
      likes: 0,
      favorites: 0,
      liked: false,
      favorited: false
    })
  })

  it('完全不带 version 的文件同样按 0 处理，不因缺字段报错', () => {
    const result = parseBackup(JSON.stringify({ posts: [{ id: 'a', text: 'x', createdAt: 1 }] }))
    expect(result.ok).toBe(true)
    expect(result.posts[0].likes).toBe(0)
    expect(result.posts[0].liked).toBe(false)
  })

  it('用 shared 的 normalizeReactions 规范化：脏互动数据不会漏进 store', () => {
    const raw = JSON.stringify({
      posts: [
        { id: 'a', text: '脏数据', createdAt: 1, likes: -5, favorites: 'x', liked: 1, favorited: null },
        // 标记为真但计数 0 → 计数抬到 1（否则界面自相矛盾）
        { id: 'b', text: '不自洽', createdAt: 2, likes: 0, liked: true }
      ]
    })

    const [notSelfConsistent, dirty] = parseBackup(raw).posts

    expect(dirty).toEqual({
      id: 'a',
      text: '脏数据',
      createdAt: 1,
      likes: 0,
      favorites: 0,
      liked: false,
      favorited: false
    })
    expect(notSelfConsistent.liked).toBe(true)
    expect(notSelfConsistent.likes).toBe(1)
  })

  it('每条动态都带完整的互动字段（下游无需再判 undefined）', () => {
    const raw = JSON.stringify({ posts: [{ id: 'a', text: 'x', createdAt: 1 }] })
    const post = parseBackup(raw).posts[0]

    expect(Object.keys(post).sort()).toEqual(
      ['createdAt', 'favorited', 'favorites', 'id', 'liked', 'likes', 'text'].sort()
    )
  })

  it('互动字段不影响去重键：内容与时间相同仍算重复', () => {
    // 去重只看 text + createdAt，互动不同不该被当成两条
    const raw = JSON.stringify({
      posts: [
        { id: 'a', text: 'dup', createdAt: 1, likes: 5, liked: true },
        { id: 'b', text: 'dup', createdAt: 1, likes: 0, liked: false }
      ]
    })
    expect(parseBackup(raw).posts).toHaveLength(1)
  })
})

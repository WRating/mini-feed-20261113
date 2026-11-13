/**
 * 共享互动状态模块测试。
 *
 * 这个模块被前后端同时导入，因此它的测试必须覆盖到"两端都可能喂进来的脏数据"：
 * 备份文件、被改过的客户端、旧版本遗留数据。
 * 放在 src 下（frontend project）是为了顺带验证浏览器端能正常导入 @shared。
 */
import { describe, it, expect } from 'vitest'
import {
  isValidKind,
  normalizeReactions,
  pickReactions,
  setReaction,
  toggleReaction,
  sumReactions
} from '@shared/post-shape'

describe('isValidKind', () => {
  it('只接受 like 与 favorite', () => {
    expect(isValidKind('like')).toBe(true)
    expect(isValidKind('favorite')).toBe(true)
  })

  it('拒绝其他值（避免拼错的 kind 静默生效）', () => {
    expect(isValidKind('likes')).toBe(false)
    expect(isValidKind('fav')).toBe(false)
    expect(isValidKind('')).toBe(false)
    expect(isValidKind(null)).toBe(false)
    expect(isValidKind(undefined)).toBe(false)
    expect(isValidKind(1)).toBe(false)
  })
})

describe('normalizeReactions · 兜底', () => {
  it('空输入得到全零状态', () => {
    expect(normalizeReactions(undefined)).toEqual({
      likes: 0,
      favorites: 0,
      liked: false,
      favorited: false
    })
    expect(normalizeReactions(null)).toEqual({
      likes: 0,
      favorites: 0,
      liked: false,
      favorited: false
    })
  })

  it('数组与原始值不当作对象处理', () => {
    expect(normalizeReactions([])).toEqual({ likes: 0, favorites: 0, liked: false, favorited: false })
    expect(normalizeReactions('x')).toEqual({ likes: 0, favorites: 0, liked: false, favorited: false })
    expect(normalizeReactions(5)).toEqual({ likes: 0, favorites: 0, liked: false, favorited: false })
  })

  it('非法计数一律回落 0（负数 / 小数 / NaN / 字符串 / Infinity）', () => {
    expect(normalizeReactions({ likes: -3 }).likes).toBe(0)
    expect(normalizeReactions({ likes: 2.9 }).likes).toBe(2)
    expect(normalizeReactions({ likes: NaN }).likes).toBe(0)
    expect(normalizeReactions({ likes: '7' }).likes).toBe(0)
    expect(normalizeReactions({ likes: Infinity }).likes).toBe(0)
  })

  it('非布尔标记视为 false（只有严格 true 才算已互动）', () => {
    expect(normalizeReactions({ liked: 'yes' }).liked).toBe(false)
    expect(normalizeReactions({ liked: 1 }).liked).toBe(false)
    expect(normalizeReactions({ liked: true }).liked).toBe(true)
  })

  it('忽略未知字段，输出形状稳定', () => {
    const result = normalizeReactions({ likes: 1, bogus: 9, shares: 3 })
    expect(Object.keys(result).sort()).toEqual(['favorited', 'favorites', 'liked', 'likes'])
  })
})

describe('normalizeReactions · 自洽性', () => {
  it('标记为真但计数为 0 时把计数抬到 1', () => {
    // 否则界面会显示"已点赞但 0 人点赞"，用户看到的高亮与数字自相矛盾
    const result = normalizeReactions({ liked: true, likes: 0 })
    expect(result.liked).toBe(true)
    expect(result.likes).toBe(1)
  })

  it('计数大于 0 但标记为假时保留计数（多人点赞、本人未点）', () => {
    const result = normalizeReactions({ liked: false, likes: 5 })
    expect(result.liked).toBe(false)
    expect(result.likes).toBe(5)
  })

  it('收藏与点赞互不影响', () => {
    const result = normalizeReactions({ liked: true, likes: 1 })
    expect(result.favorited).toBe(false)
    expect(result.favorites).toBe(0)
  })
})

describe('pickReactions', () => {
  it('从 Post 对象里抽出互动字段', () => {
    const post = { id: 'a', text: 'hi', createdAt: 1, likes: 2, liked: true }
    expect(pickReactions(post)).toEqual({ likes: 2, favorites: 0, liked: true, favorited: false })
  })

  it('没有互动字段的旧数据得到全零状态（向后兼容）', () => {
    expect(pickReactions({ id: 'a', text: 'hi', createdAt: 1 })).toEqual({
      likes: 0,
      favorites: 0,
      liked: false,
      favorited: false
    })
  })
})

describe('setReaction', () => {
  it('点赞：计数 +1 且标记为真', () => {
    const next = setReaction({ likes: 0, liked: false }, 'like', true)
    expect(next).toEqual({ likes: 1, favorites: 0, liked: true, favorited: false })
  })

  it('取消点赞：计数 -1 且标记为假', () => {
    const next = setReaction({ likes: 1, liked: true }, 'like', false)
    expect(next.likes).toBe(0)
    expect(next.liked).toBe(false)
  })

  it('取消一个本来就是假的赞不会把计数减成负数', () => {
    const next = setReaction({ likes: 0, liked: false }, 'like', false)
    expect(next.likes).toBe(0)
  })

  it('重复取消同一个赞不会持续减少（幂等保护）', () => {
    const once = setReaction({ likes: 2, liked: true }, 'like', false)
    expect(once.likes).toBe(1)
    // 状态已是 false，再设一次 false 应原样返回
    const twice = setReaction(once, 'like', false)
    expect(twice.likes).toBe(1)
  })

  it('状态没变化时返回规则化的副本但数值不变', () => {
    const current = { likes: 3, liked: false }
    const next = setReaction(current, 'like', false)
    expect(next.likes).toBe(3)
    expect(next.liked).toBe(false)
  })

  it('收藏走独立的字段，不影响点赞', () => {
    const next = setReaction({ likes: 5, liked: false }, 'favorite', true)
    expect(next).toEqual({ likes: 5, favorites: 1, liked: false, favorited: true })
  })

  it('非法 kind 原样规范化返回，不抛错', () => {
    expect(() => setReaction({ likes: 1 }, 'bogus', true)).not.toThrow()
    expect(setReaction({ likes: 1 }, 'bogus', true).likes).toBe(1)
  })

  it('不修改入参（store 依赖返回新对象触发响应式）', () => {
    const current = { likes: 0, liked: false }
    const next = setReaction(current, 'like', true)
    expect(next).not.toBe(current)
    expect(current.likes).toBe(0)
  })

  it('从脏数据出发也能得到自洽结果', () => {
    const next = setReaction({ likes: -5, liked: 'x' }, 'like', true)
    expect(next.likes).toBe(1)
    expect(next.liked).toBe(true)
  })
})

describe('toggleReaction', () => {
  it('未点赞时点一下变成已点赞', () => {
    const next = toggleReaction({ likes: 0, liked: false }, 'like')
    expect(next).toEqual({ likes: 1, favorites: 0, liked: true, favorited: false })
  })

  it('已点赞时点一下取消', () => {
    const next = toggleReaction({ likes: 1, liked: true }, 'like')
    expect(next.likes).toBe(0)
    expect(next.liked).toBe(false)
  })

  it('连续切换两次回到初始状态（可逆）', () => {
    const start = { likes: 3, liked: false }
    const once = toggleReaction(start, 'like')
    const twice = toggleReaction(once, 'like')
    expect(twice.likes).toBe(3)
    expect(twice.liked).toBe(false)
  })

  it('收藏的切换与点赞独立', () => {
    const next = toggleReaction({ likes: 2, liked: true }, 'favorite')
    expect(next.likes).toBe(2)
    expect(next.liked).toBe(true)
    expect(next.favorites).toBe(1)
    expect(next.favorited).toBe(true)
  })

  it('非法 kind 不抛错且状态不变', () => {
    const next = toggleReaction({ likes: 1, liked: true }, 'nope')
    expect(next.likes).toBe(1)
    expect(next.liked).toBe(true)
  })
})

describe('sumReactions', () => {
  it('汇总多条动态的互动数', () => {
    const posts = [
      { likes: 2, favorites: 1 },
      { likes: 3, favorites: 0 },
      { likes: 0, favorites: 4 }
    ]
    expect(sumReactions(posts)).toEqual({ likes: 5, favorites: 5 })
  })

  it('空数组与非法入参得到全零', () => {
    expect(sumReactions([])).toEqual({ likes: 0, favorites: 0 })
    expect(sumReactions(null)).toEqual({ likes: 0, favorites: 0 })
    expect(sumReactions('x')).toEqual({ likes: 0, favorites: 0 })
  })

  it('跳过非法条目而不是整体失败', () => {
    const posts = [{ likes: 1 }, null, 'x', undefined, { likes: 2 }]
    expect(sumReactions(posts)).toEqual({ likes: 3, favorites: 0 })
  })

  it('按规范化规则计入（标记为真但计数 0 也算 1）', () => {
    expect(sumReactions([{ liked: true, likes: 0 }])).toEqual({ likes: 1, favorites: 0 })
  })
})

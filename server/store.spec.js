import { describe, it, expect, beforeEach } from 'vitest'
import {
  MAX_LEN,
  NAME_MAX,
  BIO_MAX,
  AVATARS,
  DEFAULT_NAME,
  DEFAULT_BIO,
  DEFAULT_AVATAR,
  DEDUPE_SEP,
  ERROR_CODES,
  EMPTY_REACTIONS,
  REACTION_ACTIONS,
  DEFAULT_MOOD,
  MOOD_KEYS
} from '../shared/constants.js'

import { createStore } from './store.js'

/** 断言某个调用抛出带指定 code 的 Error，返回该错误便于进一步断言 */
function expectCode(fn, code) {
  let caught
  try {
    fn()
  } catch (error) {
    caught = error
  }
  expect(caught, `期望抛出 ${code}，实际未抛出`).toBeInstanceOf(Error)
  expect(caught.code).toBe(code)
  return caught
}

describe('createStore 隔离性', () => {
  it('每次调用都返回全新实例，数据互不影响', () => {
    const a = createStore()
    const b = createStore()

    a.addPost('只属于 a 的内容')

    expect(a.listPosts()).toHaveLength(1)
    // b 必须是干净的：模块顶层若建了单例，这里会失败
    expect(b.listPosts()).toHaveLength(0)
  })

  it('两个实例的资料也相互独立', () => {
    const a = createStore()
    const b = createStore()

    a.updateProfile({ name: '阿铁' })

    expect(b.getProfile().name).toBe(DEFAULT_NAME)
  })
})

describe('addPost', () => {
  let store

  beforeEach(() => {
    store = createStore()
  })

  it('创建成功时返回完整 Post 结构', () => {
    const post = store.addPost('  你好世界  ')

    expect(typeof post.id).toBe('string')
    expect(post.id.length).toBeGreaterThan(0)
    // 服务端负责 trim
    expect(post.text).toBe('你好世界')
    expect(Number.isFinite(post.createdAt)).toBe(true)
  })

  it('创建后可从列表查到同一条', () => {
    const post = store.addPost('唯一内容')
    const [only] = store.listPosts()

    expect(only).toEqual(post)
  })

  it('新建动态的互动字段全为 0 / false', () => {
    const post = store.addPost('一条新动态')

    expect({
      likes: post.likes,
      favorites: post.favorites,
      liked: post.liked,
      favorited: post.favorited
    }).toEqual(EMPTY_REACTIONS)
  })

  it('每次创建都生成不同 id', () => {
    const first = store.addPost('同一条内容')
    const second = store.addPost('同一条内容')

    expect(first.id).not.toBe(second.id)
  })

  it('恰好 MAX_LEN 字可以通过', () => {
    const post = store.addPost('字'.repeat(MAX_LEN))

    expect(post.text).toHaveLength(MAX_LEN)
  })

  it('纯空白内容抛 EMPTY', () => {
    expectCode(() => store.addPost('   \n\t  '), ERROR_CODES.EMPTY)
  })

  it('空字符串抛 EMPTY', () => {
    expectCode(() => store.addPost(''), ERROR_CODES.EMPTY)
  })

  it('超过 MAX_LEN 抛 TOO_LONG', () => {
    expectCode(() => store.addPost('字'.repeat(MAX_LEN + 1)), ERROR_CODES.TOO_LONG)
  })

  it('非字符串抛 INVALID', () => {
    for (const bad of [undefined, null, 123, true, {}, [], () => {}]) {
      expectCode(() => store.addPost(bad), ERROR_CODES.INVALID)
    }
  })

  it('校验失败不得写入任何数据', () => {
    expectCode(() => store.addPost('   '), ERROR_CODES.EMPTY)
    expectCode(() => store.addPost('字'.repeat(MAX_LEN + 1)), ERROR_CODES.TOO_LONG)
    expectCode(() => store.addPost(null), ERROR_CODES.INVALID)

    expect(store.listPosts()).toHaveLength(0)
    expect(store.stats().posts).toBe(0)
  })

  it('错误对象带可读 message', () => {
    const error = expectCode(() => store.addPost('  '), ERROR_CODES.EMPTY)

    expect(typeof error.message).toBe('string')
    expect(error.message.length).toBeGreaterThan(0)
  })
})

describe('listPosts', () => {
  let store

  beforeEach(() => {
    store = createStore()
  })

  it('空仓库返回空数组而不是 undefined', () => {
    expect(store.listPosts()).toEqual([])
  })

  it('按 createdAt 倒序排列（新的在前）', () => {
    // 用 mergePosts 注入确定的 createdAt，避免依赖真实时钟
    store.mergePosts([
      { text: '最早', createdAt: 1000 },
      { text: '最新', createdAt: 3000 },
      { text: '中间', createdAt: 2000 }
    ])

    expect(store.listPosts().map((post) => post.text)).toEqual(['最新', '中间', '最早'])
  })

  it('返回的是副本，外部篡改不影响内部状态', () => {
    store.addPost('原始内容')

    const snapshot = store.listPosts()
    snapshot.push({ id: 'fake', text: '伪造', createdAt: 0 })
    snapshot[0].text = '被改了'

    expect(store.listPosts()).toHaveLength(1)
    expect(store.listPosts()[0].text).toBe('原始内容')
  })
})

describe('getPost', () => {
  let store

  beforeEach(() => {
    store = createStore()
  })

  it('命中时返回对应动态', () => {
    const post = store.addPost('可查询')

    expect(store.getPost(post.id)).toEqual(post)
  })

  it('未命中返回 undefined', () => {
    expect(store.getPost('不存在的 id')).toBeUndefined()
  })

  it('读取旧数据（缺互动字段）时补全为 0 / false 而不是 undefined', () => {
    // v1 备份没有互动字段，经 mergePosts 灌入后读取必须形状完整
    store.mergePosts([{ text: '旧数据', createdAt: 1000 }])

    const fetched = store.getPost(store.listPosts()[0].id)

    expect({
      likes: fetched.likes,
      favorites: fetched.favorites,
      liked: fetched.liked,
      favorited: fetched.favorited
    }).toEqual(EMPTY_REACTIONS)
  })
})

describe('setReaction', () => {
  let store

  beforeEach(() => {
    store = createStore()
  })

  it('点赞（add）后计数为 1 且标记为真', () => {
    const post = store.addPost('点赞目标')

    const updated = store.setReaction(post.id, 'like', REACTION_ACTIONS.ADD)

    expect(updated.likes).toBe(1)
    expect(updated.liked).toBe(true)
  })

  it('收藏（add）走独立字段，不影响点赞', () => {
    const post = store.addPost('收藏目标')

    const updated = store.setReaction(post.id, 'favorite', REACTION_ACTIONS.ADD)

    expect(updated.favorites).toBe(1)
    expect(updated.favorited).toBe(true)
    expect(updated.likes).toBe(0)
    expect(updated.liked).toBe(false)
  })

  it('remove 幂等地设为「无」', () => {
    const post = store.addPost('取消目标')
    store.setReaction(post.id, 'like', REACTION_ACTIONS.ADD)

    const updated = store.setReaction(post.id, 'like', REACTION_ACTIONS.REMOVE)

    expect(updated.likes).toBe(0)
    expect(updated.liked).toBe(false)
  })

  it('重复 remove 不会把计数减成负数', () => {
    const post = store.addPost('幂等目标')

    store.setReaction(post.id, 'like', REACTION_ACTIONS.REMOVE)
    const updated = store.setReaction(post.id, 'like', REACTION_ACTIONS.REMOVE)

    expect(updated.likes).toBe(0)
  })

  it('省略 action 时按 toggle 处理（未赞 -> 已赞）', () => {
    const post = store.addPost('切换目标')

    const updated = store.setReaction(post.id, 'like')

    expect(updated.liked).toBe(true)
    expect(updated.likes).toBe(1)
  })

  it('toggle 两次回到初始状态', () => {
    const post = store.addPost('切换两次')

    store.setReaction(post.id, 'like')
    const updated = store.setReaction(post.id, 'like')

    expect(updated.liked).toBe(false)
    expect(updated.likes).toBe(0)
  })

  it('返回更新后的完整 Post 副本（含 id / text / createdAt）', () => {
    const post = store.addPost('完整形状')

    const updated = store.setReaction(post.id, 'like', REACTION_ACTIONS.ADD)

    expect(updated.id).toBe(post.id)
    expect(updated.text).toBe(post.text)
    expect(updated.createdAt).toBe(post.createdAt)
  })

  it('返回值是副本：改动它不影响内部状态', () => {
    const post = store.addPost('副本校验')

    const updated = store.setReaction(post.id, 'like', REACTION_ACTIONS.ADD)
    updated.likes = 999

    expect(store.getPost(post.id).likes).toBe(1)
  })

  it('更新后的状态会被后续读取到', () => {
    const post = store.addPost('持久化校验')

    store.setReaction(post.id, 'like', REACTION_ACTIONS.ADD)

    expect(store.getPost(post.id).liked).toBe(true)
    expect(store.listPosts()[0].liked).toBe(true)
  })

  it('id 不存在抛 NOT_FOUND', () => {
    expectCode(() => store.setReaction('nope', 'like', REACTION_ACTIONS.ADD), ERROR_CODES.NOT_FOUND)
  })

  it('kind 非法抛 INVALID', () => {
    const post = store.addPost('非法 kind')

    const error = expectCode(
      () => store.setReaction(post.id, 'likes', REACTION_ACTIONS.ADD),
      ERROR_CODES.INVALID
    )
    expect(error.message).toContain('未知的互动类型')
  })

  it('kind 非法时不得写入任何状态', () => {
    const post = store.addPost('非法 kind 不写入')

    expectCode(() => store.setReaction(post.id, 'bogus', REACTION_ACTIONS.ADD), ERROR_CODES.INVALID)

    expect(store.getPost(post.id)).toEqual(post)
  })
})

describe('removePost', () => {
  let store

  beforeEach(() => {
    store = createStore()
  })

  it('删除成功返回 true 且列表减少', () => {
    const post = store.addPost('待删除')

    expect(store.removePost(post.id)).toBe(true)
    expect(store.listPosts()).toHaveLength(0)
    expect(store.getPost(post.id)).toBeUndefined()
  })

  it('删除不存在的 id 返回 false', () => {
    expect(store.removePost('nope')).toBe(false)
  })

  it('只删除目标条目，其余保持不变', () => {
    const keep = store.addPost('保留')
    const drop = store.addPost('删除')

    store.removePost(drop.id)

    expect(store.listPosts().map((post) => post.id)).toEqual([keep.id])
  })
})

describe('mergePosts', () => {
  let store

  beforeEach(() => {
    store = createStore()
  })

  it('全部合法时 added 等于条数、skipped 为 0', () => {
    const result = store.mergePosts([
      { id: 'a', text: '第一条', createdAt: 1000 },
      { id: 'b', text: '第二条', createdAt: 2000 }
    ])

    expect(result).toEqual({ added: 2, skipped: 0 })
    expect(store.listPosts()).toHaveLength(2)
  })

  it('按 text + DEDUPE_SEP + createdAt 去重', () => {
    const result = store.mergePosts([
      { text: '重复', createdAt: 1000 },
      { text: '重复', createdAt: 1000 }
    ])

    expect(result).toEqual({ added: 1, skipped: 1 })
  })

  it('内容相同但时间不同视为不同动态', () => {
    const result = store.mergePosts([
      { text: '同样的话', createdAt: 1000 },
      { text: '同样的话', createdAt: 2000 }
    ])

    expect(result).toEqual({ added: 2, skipped: 0 })
  })

  it('与仓库已有数据比较去重', () => {
    store.mergePosts([{ text: '已存在', createdAt: 5000 }])

    const result = store.mergePosts([{ text: '已存在', createdAt: 5000 }])

    expect(result).toEqual({ added: 0, skipped: 1 })
  })

  it('非法条目计入 skipped 且不报错', () => {
    const result = store.mergePosts([
      { text: '合法', createdAt: 1000 },
      { createdAt: 1000 }, // 缺 text
      { text: '', createdAt: 2000 }, // 空 text
      { text: '   ', createdAt: 3000 }, // 纯空白
      { text: '无时间' }, // 缺 createdAt
      { text: '非法时间', createdAt: '2026-01-01' }, // 非数字
      { text: '无穷大', createdAt: Infinity }, // 非有限
      { text: 'NaN', createdAt: NaN },
      null,
      'garbage',
      42
    ])

    expect(result).toEqual({ added: 1, skipped: 10 })
  })

  it('超长文本截断到 MAX_LEN 而不是丢弃', () => {
    const longText = '超'.repeat(MAX_LEN + 50)

    const result = store.mergePosts([{ text: longText, createdAt: 1000 }])

    expect(result).toEqual({ added: 1, skipped: 0 })
    expect(store.listPosts()[0].text).toHaveLength(MAX_LEN)
  })

  it('缺失 id 时由服务端补齐', () => {
    store.mergePosts([{ text: '没有 id', createdAt: 1000 }])

    const [post] = store.listPosts()
    expect(typeof post.id).toBe('string')
    expect(post.id.length).toBeGreaterThan(0)
  })

  it('合并后列表仍为倒序', () => {
    store.mergePosts([
      { text: '旧', createdAt: 1000 },
      { text: '新', createdAt: 9000 }
    ])

    // 再次合并更早的条目，不能打乱整体顺序
    store.mergePosts([{ text: '更旧', createdAt: 500 }])

    expect(store.listPosts().map((post) => post.text)).toEqual(['新', '旧', '更旧'])
  })

  it('text 两端空白会被 trim', () => {
    store.mergePosts([{ text: '  有空白的  ', createdAt: 1000 }])

    expect(store.listPosts()[0].text).toBe('有空白的')
  })

  it('入参不是数组时抛 INVALID', () => {
    expectCode(() => store.mergePosts(null), ERROR_CODES.INVALID)
    expectCode(() => store.mergePosts({ posts: [] }), ERROR_CODES.INVALID)
    expectCode(() => store.mergePosts('[]'), ERROR_CODES.INVALID)
  })

  it('空数组是合法的空操作', () => {
    expect(store.mergePosts([])).toEqual({ added: 0, skipped: 0 })
  })

  it('去重键必须带分隔符，否则「内容+时间」直接拼接会撞车', () => {
    // 无分隔符时 'a1'+2 与 'a'+12 都会拼成 'a12'，被误判为重复
    const result = store.mergePosts([
      { text: 'a1', createdAt: 2 },
      { text: 'a', createdAt: 12 }
    ])

    expect(result).toEqual({ added: 2, skipped: 0 })
  })

  it('正文里出现 DEDUPE_SEP 字符也不会误判重复', () => {
    const tricky = `a${DEDUPE_SEP}b`

    const result = store.mergePosts([
      { text: tricky, createdAt: 1 },
      { text: 'a', createdAt: 1 }
    ])

    expect(result).toEqual({ added: 2, skipped: 0 })
  })

  it('导入时带上互动字段，按目标状态写入', () => {
    store.mergePosts([
      { text: '带互动', createdAt: 1000, likes: 3, favorites: 2, liked: true, favorited: true }
    ])

    const [post] = store.listPosts()
    expect({
      likes: post.likes,
      favorites: post.favorites,
      liked: post.liked,
      favorited: post.favorited
    }).toEqual({ likes: 3, favorites: 2, liked: true, favorited: true })
  })

  it('缺失互动字段时按 0 / false 补全', () => {
    store.mergePosts([{ text: '无互动', createdAt: 1000 }])

    const [post] = store.listPosts()
    expect({
      likes: post.likes,
      favorites: post.favorites,
      liked: post.liked,
      favorited: post.favorited
    }).toEqual(EMPTY_REACTIONS)
  })

  it('超范围计数按 normalizeReactions 规范化（负数归 0、标记为真抬到 1）', () => {
    store.mergePosts([
      { text: '负数', createdAt: 1000, likes: -5, liked: false },
      { text: '自相矛盾', createdAt: 2000, likes: 0, liked: true }
    ])

    const byText = Object.fromEntries(store.listPosts().map((post) => [post.text, post]))
    expect(byText['负数'].likes).toBe(0)
    expect(byText['自相矛盾'].likes).toBe(1)
  })

  it('同一份备份导入两次结果一致（计数不翻倍）', () => {
    const backup = [
      { text: '备份条目', createdAt: 1000, likes: 5, favorites: 2, liked: true, favorited: true }
    ]

    store.mergePosts(backup)

    // 同一份备份再导一次：去重会跳过，计数必须保持不变
    store.mergePosts(backup)

    const [post] = store.listPosts()
    expect(post.likes).toBe(5)
    expect(post.favorites).toBe(2)
  })
})

describe('clearPosts', () => {
  it('清空全部动态但保留个人资料', () => {
    const store = createStore()
    store.addPost('第一条')
    store.addPost('第二条')
    store.updateProfile({ name: '阿铁' })

    store.clearPosts()

    expect(store.listPosts()).toEqual([])
    expect(store.stats().posts).toBe(0)
    expect(store.getProfile().name).toBe('阿铁')
  })
})

describe('getProfile', () => {
  it('初始化即为默认资料', () => {
    const store = createStore()
    const profile = store.getProfile()

    expect(profile.name).toBe(DEFAULT_NAME)
    expect(profile.bio).toBe(DEFAULT_BIO)
    expect(profile.avatar).toBe(DEFAULT_AVATAR)
    expect(Number.isFinite(profile.joinedAt)).toBe(true)
  })

  it('返回副本，外部篡改不影响内部状态', () => {
    const store = createStore()

    const profile = store.getProfile()
    profile.name = '被篡改'

    expect(store.getProfile().name).toBe(DEFAULT_NAME)
  })
})

describe('updateProfile', () => {
  let store

  beforeEach(() => {
    store = createStore()
  })

  it('只更新传入的字段', () => {
    const profile = store.updateProfile({ name: '阿铁' })

    expect(profile.name).toBe('阿铁')
    expect(profile.bio).toBe(DEFAULT_BIO)
    expect(profile.avatar).toBe(DEFAULT_AVATAR)
  })

  it('字段两端空白被 trim', () => {
    const profile = store.updateProfile({ name: '  阿铁  ', bio: '  简介  ' })

    expect(profile.name).toBe('阿铁')
    expect(profile.bio).toBe('简介')
  })

  it('name trim 后为空回退默认值', () => {
    const profile = store.updateProfile({ name: '   ' })

    expect(profile.name).toBe(DEFAULT_NAME)
  })

  it('name 超过 NAME_MAX 截断', () => {
    const profile = store.updateProfile({ name: '名'.repeat(NAME_MAX + 10) })

    expect(profile.name).toHaveLength(NAME_MAX)
  })

  it('bio 超过 BIO_MAX 截断', () => {
    const profile = store.updateProfile({ bio: '介'.repeat(BIO_MAX + 10) })

    expect(profile.bio).toHaveLength(BIO_MAX)
  })

  it('bio 允许为空字符串', () => {
    const profile = store.updateProfile({ bio: '   ' })

    expect(profile.bio).toBe('')
  })

  it('合法头像可以更新', () => {
    for (const avatar of AVATARS) {
      const profile = store.updateProfile({ avatar })
      expect(profile.avatar).toBe(avatar)
    }
  })

  it('头像不在白名单抛 INVALID_AVATAR', () => {
    expectCode(() => store.updateProfile({ avatar: '💩' }), ERROR_CODES.INVALID_AVATAR)
    expectCode(() => store.updateProfile({ avatar: '' }), ERROR_CODES.INVALID_AVATAR)
  })

  it('头像非法时其它字段也不生效（整体拒绝）', () => {
    const before = store.getProfile()

    expectCode(() => store.updateProfile({ name: '阿铁', avatar: '💩' }), ERROR_CODES.INVALID_AVATAR)

    expect(store.getProfile()).toEqual(before)
  })

  it('joinedAt 不可被 patch 修改', () => {
    const before = store.getProfile().joinedAt

    const profile = store.updateProfile({ joinedAt: 1, name: '阿铁' })

    expect(profile.joinedAt).toBe(before)
    expect(profile.name).toBe('阿铁')
  })

  it('patch 不是对象抛 INVALID', () => {
    for (const bad of [null, undefined, 'name', 123, []]) {
      expectCode(() => store.updateProfile(bad), ERROR_CODES.INVALID)
    }
  })

  it('字段类型错误抛 INVALID', () => {
    expectCode(() => store.updateProfile({ name: 123 }), ERROR_CODES.INVALID)
    expectCode(() => store.updateProfile({ bio: null }), ERROR_CODES.INVALID)
    expectCode(() => store.updateProfile({ avatar: 42 }), ERROR_CODES.INVALID)
  })

  it('空对象是合法的空操作', () => {
    const before = store.getProfile()

    expect(store.updateProfile({})).toEqual(before)
  })
})

describe('restoreProfile', () => {
  let store

  beforeEach(() => {
    store = createStore()
  })

  it('当前仍是默认资料时应用备份', () => {
    const result = store.restoreProfile({ name: '备份用户', bio: '来自备份', avatar: '🐼' })

    expect(result.applied).toBe(true)
    expect(result.profile.name).toBe('备份用户')
    expect(result.profile.bio).toBe('来自备份')
    expect(result.profile.avatar).toBe('🐼')
    expect(store.getProfile().name).toBe('备份用户')
  })

  it('应用备份时保留原 joinedAt（joinedAt 不可被外部改写）', () => {
    const before = store.getProfile().joinedAt

    const result = store.restoreProfile({ name: '备份用户', joinedAt: 1 })

    expect(result.applied).toBe(true)
    expect(result.profile.joinedAt).toBe(before)
  })

  it('当前资料已非默认时不覆盖，返回 applied:false', () => {
    store.updateProfile({ name: '我改了' })

    const result = store.restoreProfile({ name: '备份用户', bio: '来自备份', avatar: '🐼' })

    expect(result.applied).toBe(false)
    expect(result.profile.name).toBe('我改了')
    expect(store.getProfile().name).toBe('我改了')
  })

  it('恢复内容同样做 trim 与截断', () => {
    const result = store.restoreProfile({
      name: `  ${'名'.repeat(NAME_MAX + 5)}  `,
      bio: '  介'.repeat(BIO_MAX),
      avatar: '🦊'
    })

    expect(result.profile.name).toHaveLength(NAME_MAX)
    expect(result.profile.bio).toHaveLength(BIO_MAX)
  })

  it('恢复内容 name 为空时回退默认', () => {
    const result = store.restoreProfile({ name: '   ' })

    expect(result.profile.name).toBe(DEFAULT_NAME)
  })

  it('备份头像非法抛 INVALID_AVATAR', () => {
    expectCode(() => store.restoreProfile({ name: '备份', avatar: '💩' }), ERROR_CODES.INVALID_AVATAR)
  })

  it('入参不是对象抛 INVALID', () => {
    for (const bad of [null, undefined, 'profile', 1, []]) {
      expectCode(() => store.restoreProfile(bad), ERROR_CODES.INVALID)
    }
  })
})

describe('resetProfile', () => {
  it('回退到默认资料并刷新 joinedAt', () => {
    const store = createStore()
    store.updateProfile({ name: '阿铁', bio: '简介', avatar: '🦊' })

    const before = store.getProfile()
    const reset = store.resetProfile()

    expect(reset.name).toBe(DEFAULT_NAME)
    expect(reset.bio).toBe(DEFAULT_BIO)
    expect(reset.avatar).toBe(DEFAULT_AVATAR)
    // joinedAt 更新为当前时间：不早于重置前
    expect(reset.joinedAt).toBeGreaterThanOrEqual(before.joinedAt)
    expect(store.getProfile()).toEqual(reset)
  })
})

describe('stats', () => {
  let store

  beforeEach(() => {
    store = createStore()
  })

  it('空仓库统计为零（含互动数）', () => {
    expect(store.stats()).toEqual({
      posts: 0,
      chars: 0,
      bytes: expect.any(Number),
      likes: 0,
      favorites: 0
    })
  })

  it('posts 与 chars 正确汇总', () => {
    store.addPost('abc')
    store.addPost('12345')

    const stats = store.stats()

    expect(stats.posts).toBe(2)
    expect(stats.chars).toBe(8)
  })

  it('bytes 等于 UTF-8 编码后的 JSON 字节数', () => {
    store.addPost('中文内容')
    store.updateProfile({ name: '阿铁', bio: '简介' })

    const expected = Buffer.byteLength(
      JSON.stringify({ posts: store.listPosts(), profile: store.getProfile() }),
      'utf8'
    )

    expect(store.stats().bytes).toBe(expected)
  })

  it('中文与 emoji 按多字节计数（不是字符数）', () => {
    store.addPost('🙂')

    const stats = store.stats()

    // chars 沿用 JS 的 string.length 语义（UTF-16 码元），
    // 必须与 MAX_LEN 的判定口径一致 —— 否则前端「还能输 1 个字」后端却拒收。
    // emoji 是代理对，故计 2。
    expect(stats.chars).toBe(2)
    // bytes 按 UTF-8 计：emoji 占 4 字节，因此必然大于字符数
    expect(stats.bytes).toBeGreaterThan(stats.chars)
  })

  it('chars 与 MAX_LEN 口径一致（代理对不搞双标）', () => {
    // 若 chars 改用码点计数而 MAX_LEN 仍用 length，两者会打架
    const emoji = '🙂'
    store.addPost(emoji)

    expect(store.stats().chars).toBe(emoji.length)
  })

  it('likes / favorites 汇总全部动态的互动数', () => {
    const a = store.addPost('第一条')
    const b = store.addPost('第二条')
    store.setReaction(a.id, 'like', REACTION_ACTIONS.ADD)
    store.setReaction(b.id, 'favorite', REACTION_ACTIONS.ADD)
    store.setReaction(b.id, 'like', REACTION_ACTIONS.ADD)

    const stats = store.stats()

    expect(stats.likes).toBe(2)
    expect(stats.favorites).toBe(1)
  })

  it('清空后互动数归零', () => {
    const post = store.addPost('待清空')
    store.setReaction(post.id, 'like', REACTION_ACTIONS.ADD)

    store.clearPosts()

    const stats = store.stats()
    expect(stats.likes).toBe(0)
    expect(stats.favorites).toBe(0)
  })
})

describe('profile · 心情', () => {
  let store

  beforeEach(() => {
    store = createStore()
  })

  it('默认心情为 DEFAULT_MOOD', () => {
    expect(store.getProfile().mood).toBe(DEFAULT_MOOD)
  })

  it('默认心情为「心情好」（用户明确要的默认展示）', () => {
    expect(store.getProfile().mood).toBe('great')
  })

  it('可以更新为白名单内的任意心情', () => {
    for (const key of MOOD_KEYS) {
      expect(store.updateProfile({ mood: key }).mood).toBe(key)
    }
  })

  it('非法心情抛 INVALID_MOOD（不静默忽略，便于发现前端 bug）', () => {
    expectCode(() => store.updateProfile({ mood: 'happy' }), ERROR_CODES.INVALID_MOOD)
  })

  it('非字符串心情抛 INVALID（类型错与白名单不符分开报，便于定位）', () => {
    expectCode(() => store.updateProfile({ mood: 123 }), ERROR_CODES.INVALID)
    expectCode(() => store.updateProfile({ mood: null }), ERROR_CODES.INVALID)
    expectCode(() => store.updateProfile({ mood: {} }), ERROR_CODES.INVALID)
  })

  it('只改心情不影响其他字段', () => {
    store.updateProfile({ name: '阿铁', bio: '简介', avatar: '🦊' })
    const profile = store.updateProfile({ mood: 'down' })

    expect(profile.name).toBe('阿铁')
    expect(profile.bio).toBe('简介')
    expect(profile.avatar).toBe('🦊')
    expect(profile.mood).toBe('down')
  })

  it('只改其他字段不影响心情', () => {
    store.updateProfile({ mood: 'fired' })
    store.updateProfile({ name: '阿铁' })

    expect(store.getProfile().mood).toBe('fired')
  })

  it('resetProfile 把心情一并重置', () => {
    store.updateProfile({ mood: 'tired' })
    expect(store.resetProfile().mood).toBe(DEFAULT_MOOD)
  })

  it('心情不影响 joinedAt', () => {
    const before = store.getProfile().joinedAt
    store.updateProfile({ mood: 'calm' })

    expect(store.getProfile().joinedAt).toBe(before)
  })

  it('mood 与 avatar 都能改（两者都是 profile 字段，互不干扰）', () => {
    const profile = store.updateProfile({ mood: 'calm', avatar: '🐼' })

    expect(profile.mood).toBe('calm')
    expect(profile.avatar).toBe('🐼')
  })

  it('【关键】改过心情不应阻止备份恢复资料', () => {
    // 心情只是轻量装饰，用户随手切一下不该被当成"已认真填写过资料"。
    // 若把 mood 计入 isDefault，用户导入备份时会莫名其妙恢复不了昵称。
    store.updateProfile({ mood: 'down' })

    const result = store.restoreProfile({ name: '备份用户' })

    expect(result.applied).toBe(true)
    expect(result.profile.name).toBe('备份用户')
  })

  it('改了昵称才真正阻止备份恢复（isDefault 仅由 name/bio/avatar 决定）', () => {
    store.updateProfile({ name: '阿铁' })

    expect(store.restoreProfile({ name: '备份用户' }).applied).toBe(false)
  })

  it('恢复备份时心情不会被顺带清掉（备份没带 mood 就保持原值）', () => {
    store.updateProfile({ mood: 'fired' })

    const result = store.restoreProfile({ name: '备份用户' })

    expect(result.profile.mood).toBe('fired')
  })

  it('备份里带了 mood 时会一并恢复', () => {
    const result = store.restoreProfile({ name: '备份用户', mood: 'calm' })

    expect(result.profile.mood).toBe('calm')
  })
})

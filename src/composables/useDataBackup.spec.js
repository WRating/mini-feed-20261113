/**
 * 数据备份 composable 测试（TDD）
 *
 * 它是 posts / profile 两个 store 的协调者：
 * - 导出：把两个 store 的当前状态组装成备份文件并触发下载（同步能力，仍为同步）
 * - 导入：解析 → 合并动态 → 按规则恢复资料 → 返回可展示的结果（后端化后为**异步**）
 * - 清空：两个 store 一起清，保证不留半截状态（异步）
 *
 * 依赖注入同样是工厂模式：为两个 store 各注入一个 fake api-client。
 * fake api 内部维护一份「服务端状态」，语义对齐 server/store.js（trim / 倒序 /
 * text+createdAt 去重 / 超长截断 / 默认值才应用备份资料）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useDataBackup } from './useDataBackup'
import { usePostsStore, setPostsApiFactory, resetPostsApiFactory } from '@/stores/posts'
import { useProfileStore, setProfileApiFactory, resetProfileApiFactory } from '@/stores/profile'
import { NAME_MAX, BIO_MAX, AVATARS } from '@shared/constants'
import { DEFAULT_NAME, DEFAULT_BIO, DEFAULT_AVATAR } from '@shared/constants'

const NOW = new Date(2026, 10, 13, 10, 0, 0).getTime()

const clamp = (v, max) => (v.length > max ? v.slice(0, max) : v)

/**
 * 造一份「服务端」替身，同时充当 posts 与 profile 两个 store 的 api。
 * 用真实的内存状态模拟服务端，比逐个方法 mock 更能暴露协调层的接缝问题。
 */
function fakeServerApi() {
  let posts = []
  let profile = {
    name: DEFAULT_NAME,
    bio: DEFAULT_BIO,
    avatar: DEFAULT_AVATAR,
    joinedAt: NOW - 3 * 86_400_000
  }

  const sorted = () =>
    [...posts].sort((a, b) => b.createdAt - a.createdAt).map((p) => ({ ...p }))
  const dedupeKey = (p) => `${p.text}\u0000${p.createdAt}`

  // 抽成局部函数而不是 api.updateProfile：箭头函数里的 this 不是 api 对象，
  // 用 this.updateProfile 会在 restoreProfile 内部静默抛错。
  function applyPatch(patch) {
    const next = { ...profile }
    if (patch.name !== undefined) {
      next.name = clamp(String(patch.name).trim(), NAME_MAX) || DEFAULT_NAME
    }
    if (patch.bio !== undefined) next.bio = clamp(String(patch.bio).trim(), BIO_MAX)
    if (patch.avatar !== undefined) {
      if (!AVATARS.includes(patch.avatar)) throw new Error('头像不在可选列表中')
      next.avatar = patch.avatar
    }
    profile = next
    return { ...profile }
  }

  return {
    // ---- posts ----
    listPosts: vi.fn(async () => sorted()),

    createPost: vi.fn(async (text) => {
      const post = { id: `p${posts.length + 1}`, text: String(text).trim(), createdAt: Date.now() }
      posts.push(post)
      return { ...post }
    }),

    removePost: vi.fn(async (id) => {
      posts = posts.filter((p) => p.id !== id)
      return undefined
    }),

    mergePosts: vi.fn(async (items) => {
      const existing = new Set(posts.map(dedupeKey))
      let added = 0
      let skipped = 0

      items.forEach((raw, index) => {
        const valid =
          raw && typeof raw === 'object' && !Array.isArray(raw) &&
          typeof raw.text === 'string' && Number.isFinite(raw.createdAt)
        if (!valid) {
          skipped += 1
          return
        }
        const text = clamp(raw.text.trim(), 280)
        if (!text) {
          skipped += 1
          return
        }
        const candidate = {
          id: typeof raw.id === 'string' && raw.id ? raw.id : `imported-${raw.createdAt}-${index}`,
          text,
          createdAt: raw.createdAt
        }
        if (existing.has(dedupeKey(candidate))) {
          skipped += 1
          return
        }
        existing.add(dedupeKey(candidate))
        posts.push(candidate)
        added += 1
      })

      return { added, skipped, posts: sorted() }
    }),

    clearPosts: vi.fn(async () => {
      posts = []
      return undefined
    }),

    // ---- profile ----
    getProfile: vi.fn(async () => ({ ...profile })),

    updateProfile: vi.fn(async (patch) => applyPatch(patch)),

    restoreProfile: vi.fn(async (backup) => {
      const isDefault =
        profile.name === DEFAULT_NAME &&
        profile.bio === DEFAULT_BIO &&
        profile.avatar === DEFAULT_AVATAR
      if (!isDefault) return { applied: false, profile: { ...profile } }
      return { applied: true, profile: applyPatch(backup) }
    }),

    resetProfile: vi.fn(async () => {
      profile = { name: DEFAULT_NAME, bio: DEFAULT_BIO, avatar: DEFAULT_AVATAR, joinedAt: Date.now() }
      return { ...profile }
    })
  }
}

let api

beforeEach(() => {
  setActivePinia(createPinia())
  api = fakeServerApi()
  setPostsApiFactory(() => api)
  setProfileApiFactory(() => api)
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  resetPostsApiFactory()
  resetProfileApiFactory()
})

describe('useDataBackup · exportBackup', () => {
  it('组装出带动态与资料的备份对象', async () => {
    const posts = usePostsStore()
    const profile = useProfileStore()
    await posts.publish('第一条')
    await profile.update({ name: '小记' })

    const { buildPayload } = useDataBackup()
    const payload = buildPayload()

    expect(payload.app).toBe('minifeed')
    expect(payload.posts).toHaveLength(1)
    expect(payload.posts[0].text).toBe('第一条')
    expect(payload.profile.name).toBe('小记')
    expect(payload.exportedAt).toBe(new Date(NOW).toISOString())
  })

  it('空数据也能导出（posts 为空数组）', () => {
    const payload = useDataBackup().buildPayload()
    expect(payload.posts).toEqual([])
  })

  it('生成带日期的文件名', () => {
    const name = useDataBackup().buildFileName()
    expect(name).toMatch(/^minifeed-backup-\d{8}-\d{4}\.json$/)
    expect(name).toContain('20261113')
  })

  it('下载流程调用了浏览器能力，且不抛错', async () => {
    const posts = usePostsStore()
    await posts.publish('内容')

    // 只替换静态方法，保留 URL 构造器本身
    const originalCreate = URL.createObjectURL
    const originalRevoke = URL.revokeObjectURL
    const createObjectURL = vi.fn(() => 'blob:mock')
    const revokeObjectURL = vi.fn()
    URL.createObjectURL = createObjectURL
    URL.revokeObjectURL = revokeObjectURL

    const click = vi.fn()
    const originalCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = originalCreateElement(tag)
      if (tag === 'a') el.click = click
      return el
    })

    try {
      const result = useDataBackup().exportBackup()
      expect(result.ok).toBe(true)
      expect(result.count).toBe(1)
      expect(click).toHaveBeenCalled()
      expect(createObjectURL).toHaveBeenCalled()
      // 下载后要回收 objectURL，避免内存泄漏
      vi.runAllTimers()
      expect(revokeObjectURL).toHaveBeenCalled()
    } finally {
      URL.createObjectURL = originalCreate
      URL.revokeObjectURL = originalRevoke
    }
  })

  it('浏览器不支持 Blob 时返回可读错误，不抛错', () => {
    vi.stubGlobal('Blob', undefined)
    const result = useDataBackup().exportBackup()
    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
  })
})

describe('useDataBackup · importBackup', () => {
  const validFile = JSON.stringify({
    app: 'minifeed',
    version: 1,
    posts: [
      { id: 'x1', text: '备份里的动态', createdAt: NOW + 5000 },
      { id: 'x2', text: '另一条', createdAt: NOW + 4000 }
    ],
    profile: { name: '备份用户', bio: '来自备份', avatar: '🐼' }
  })

  it('导入合法文件：动态被合并，资料被恢复', async () => {
    const posts = usePostsStore()
    const profile = useProfileStore()

    const result = await useDataBackup().importBackup(validFile)

    expect(result.ok).toBe(true)
    expect(result.added).toBe(2)
    expect(posts.count).toBe(2)
    expect(profile.name).toBe('备份用户')
    expect(result.profileRestored).toBe(true)
  })

  it('导入与已有的重复动态会被跳过', async () => {
    const posts = usePostsStore()
    const { post } = await posts.publish('已存在')

    const file = JSON.stringify({
      posts: [{ ...post, id: 'dup-id' }, { id: 'new', text: '新的', createdAt: NOW + 1000 }]
    })
    const result = await useDataBackup().importBackup(file)

    expect(result.added).toBe(1)
    expect(result.skipped).toBe(1)
    expect(posts.count).toBe(2)
  })

  it('用户已自定义资料时不被备份覆盖', async () => {
    const profile = useProfileStore()
    await profile.update({ name: '我改过的名字' })

    const result = await useDataBackup().importBackup(validFile)
    expect(result.ok).toBe(true)
    expect(result.profileRestored).toBe(false)
    expect(profile.name).toBe('我改过的名字')
  })

  it('非法 JSON 返回失败且不改动任何数据', async () => {
    const posts = usePostsStore()
    await posts.publish('原有')

    const result = await useDataBackup().importBackup('不是 JSON{{')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('JSON')
    expect(posts.count).toBe(1)
    // 解析失败时不该触碰服务端
    expect(api.mergePosts).not.toHaveBeenCalled()
  })

  it('缺少 posts 字段返回失败', async () => {
    const result = await useDataBackup().importBackup(JSON.stringify({ foo: 1 }))
    expect(result.ok).toBe(false)
    expect(result.error).toContain('posts')
  })

  it('文件为空时返回失败', async () => {
    const result = await useDataBackup().importBackup('')
    expect(result.ok).toBe(false)
  })

  it('合并请求失败时返回失败且不改动本地列表', async () => {
    const posts = usePostsStore()
    await posts.publish('原有')
    api.mergePosts.mockRejectedValueOnce(new Error('无法连接服务端'))

    const result = await useDataBackup().importBackup(validFile)

    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
    expect(posts.count).toBe(1)
  })

  it('部分条目非法时导入合法部分并报告跳过数', async () => {
    const file = JSON.stringify({
      posts: [{ id: 'a', text: 'ok', createdAt: 1 }, { junk: true }]
    })
    const result = await useDataBackup().importBackup(file)
    expect(result.ok).toBe(true)
    expect(result.added).toBe(1)
    expect(result.skipped).toBe(1)
  })

  it('导入后动态按时间倒序排列', async () => {
    const posts = usePostsStore()
    await posts.publish('本地的')

    await useDataBackup().importBackup(validFile)
    expect(posts.posts[0].text).toBe('备份里的动态')
  })

  it('把互动字段一并交给合并接口（导入语义是以备份为准的目标状态）', async () => {
    // 契约 4.7：后端按「目标状态」而不是「叠加」处理，因此前端必须把字段原样传下去，
    // 否则同一份备份导入两次会把计数翻倍。
    const file = JSON.stringify({
      version: 2,
      posts: [{ id: 'x1', text: '带互动', createdAt: NOW + 5000, likes: 3, liked: true, favorites: 1, favorited: true }]
    })

    await useDataBackup().importBackup(file)

    const sent = api.mergePosts.mock.calls[0][0]
    expect(sent[0]).toMatchObject({ likes: 3, liked: true, favorites: 1, favorited: true })
  })

  it('导入 v1 旧备份时互动字段被补成全 0，而不是 undefined', async () => {
    const file = JSON.stringify({
      app: 'minifeed',
      version: 1,
      posts: [{ id: 'old', text: '老备份', createdAt: NOW + 1000 }]
    })

    const result = await useDataBackup().importBackup(file)

    expect(result.ok).toBe(true)
    const sent = api.mergePosts.mock.calls[0][0]
    expect(sent[0]).toMatchObject({ likes: 0, favorites: 0, liked: false, favorited: false })
  })
})

describe('useDataBackup · clearAll', () => {
  it('同时清空动态与资料', async () => {
    const posts = usePostsStore()
    const profile = useProfileStore()
    await posts.publish('a')
    await posts.publish('b')
    await profile.update({ name: '阿铁', avatar: '🐼' })

    await useDataBackup().clearAll()

    expect(posts.count).toBe(0)
    expect(profile.name).toBe('我')
    expect(profile.avatar).toBe('🙂')
  })

  it('清空后使用天数重新从第 1 天算', async () => {
    const profile = useProfileStore()
    vi.setSystemTime(NOW + 10 * 86_400_000)
    await useDataBackup().clearAll()
    expect(profile.daysUsed).toBe(1)
  })
})

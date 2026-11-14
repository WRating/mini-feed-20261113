/**
 * profile store 测试（TDD）
 *
 * 关注点：
 * - 资料存在**服务端**，store 只负责搬运；服务端是校验的唯一权威；
 * - 写操作异步化后，失败必须返回可判断的结果（restoreFromBackup 返回 boolean），
 *   且不能把本地状态改成「看起来成功」的样子；
 * - update / restoreFromBackup / reset 都不允许改动 joinedAt（服务端也不会下发被改过的值）。
 *
 * 替身 api 刻意复刻 server/store.js 的规范化规则（trim / 截断 / 头像白名单），
 * 这样测试断言的是「store 与服务端的组合语义」，而不是替身的随意行为。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import {
  useProfileStore,
  setProfileApiFactory,
  resetProfileApiFactory
} from './profile'
import { ApiError } from '@/services/api-client'
import { NAME_MAX, BIO_MAX, MOOD_KEYS, MOODS } from '@shared/constants'

const NOW = new Date(2026, 10, 13, 10, 0, 0).getTime()
const DAY = 86_400_000

const AVATARS = ['🙂', '😀', '🐱', '🐼', '🦊', '🚀', '🌙', '🍀', '🎧', '📚']

const DEFAULT_NAME = '我'
const DEFAULT_BIO = '这个人很懒，什么都没写。'
const DEFAULT_AVATAR = '🙂'

const clamp = (v, max) => (v.length > max ? v.slice(0, max) : v)

/** 复刻服务端的资料补丁规范化：整体校验、逐字段 trim/截断、joinedAt 不可改 */
function normalizePatch(source) {
  const patch = {}
  if (source.name !== undefined) {
    const name = clamp(String(source.name).trim(), NAME_MAX)
    patch.name = name || DEFAULT_NAME
  }
  if (source.bio !== undefined) {
    patch.bio = clamp(String(source.bio).trim(), BIO_MAX)
  }
  if (source.avatar !== undefined) {
    if (!AVATARS.includes(source.avatar)) {
      throw new ApiError('INVALID_AVATAR', '头像不在可选列表中', 400)
    }
    patch.avatar = source.avatar
  }
  if (source.mood !== undefined) {
    if (!MOOD_KEYS.includes(source.mood)) {
      throw new ApiError('INVALID_MOOD', '心情不在可选列表中', 400)
    }
    patch.mood = source.mood
  }
  return patch
}

/** 造一个可控的 api-client 替身：内部维护一份「服务端资料」 */
function fakeApi({ initial = {}, ...overrides } = {}) {
  let profile = {
    name: DEFAULT_NAME,
    bio: DEFAULT_BIO,
    avatar: DEFAULT_AVATAR,
    mood: 'great',
    joinedAt: NOW - 3 * DAY,
    ...initial
  }

  return {
    getProfile: vi.fn(async () => ({ ...profile })),
    updateProfile: vi.fn(async (patch) => {
      profile = { ...profile, ...normalizePatch(patch) }
      return { ...profile }
    }),
    restoreProfile: vi.fn(async (backup) => {
      const isDefault =
        profile.name === DEFAULT_NAME &&
        profile.bio === DEFAULT_BIO &&
        profile.avatar === DEFAULT_AVATAR
      if (!isDefault) return { applied: false, profile: { ...profile } }
      profile = { ...profile, ...normalizePatch(backup) }
      return { applied: true, profile: { ...profile } }
    }),
    resetProfile: vi.fn(async () => {
      profile = {
        name: DEFAULT_NAME,
        bio: DEFAULT_BIO,
        avatar: DEFAULT_AVATAR,
        mood: 'great',
        joinedAt: Date.now()
      }
      return { ...profile }
    }),
    ...overrides
  }
}

function storeWith(api) {
  setProfileApiFactory(() => api)
  return useProfileStore()
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  resetProfileApiFactory()
})

describe('profile store · 默认值', () => {
  it('未加载时给出默认资料（保证首屏有内容），且未标记 loaded', () => {
    const store = storeWith(fakeApi())
    expect(store.name).toBe('我')
    expect(store.bio).toBe('这个人很懒，什么都没写。')
    expect(store.avatar).toBe('🙂')
    expect(store.loading).toBe(false)
    expect(store.loadError).toBeNull()
  })

  it('创建 store 不会自动发请求', () => {
    const api = fakeApi()
    storeWith(api)
    expect(api.getProfile).not.toHaveBeenCalled()
  })
})

describe('profile store · load', () => {
  it('加载成功后填充字段与 joinedAt', async () => {
    const store = storeWith(fakeApi({ initial: { name: '小记', bio: '简介', avatar: '🦊' } }))
    await store.load()

    expect(store.name).toBe('小记')
    expect(store.bio).toBe('简介')
    expect(store.avatar).toBe('🦊')
    expect(store.joinedAt).toBe(NOW - 3 * DAY)
    expect(store.loadError).toBeNull()
  })

  it('加载过程中 loading 为 true', async () => {
    let release
    const gate = new Promise((resolve) => {
      release = resolve
    })
    const api = fakeApi({
      getProfile: vi.fn(async () => {
        await gate
        return { name: '我', bio: DEFAULT_BIO, avatar: DEFAULT_AVATAR, joinedAt: NOW }
      })
    })
    const store = storeWith(api)

    const pending = store.load()
    expect(store.loading).toBe(true)

    release()
    await pending
    expect(store.loading).toBe(false)
  })

  it('服务端下发非法头像时回退默认（不信任远端数据）', async () => {
    const api = fakeApi({
      getProfile: vi.fn(async () => ({
        name: 'x',
        bio: 'y',
        avatar: '💣',
        joinedAt: NOW
      }))
    })
    const store = storeWith(api)
    await store.load()
    expect(store.avatar).toBe('🙂')
  })

  it('服务端缺字段时逐项回退默认值，不抛错', async () => {
    const api = fakeApi({
      getProfile: vi.fn(async () => ({ joinedAt: 'not-a-number' }))
    })
    const store = storeWith(api)
    await expect(store.load()).resolves.toBeUndefined()

    expect(store.name).toBe('我')
    expect(store.bio).toBe('这个人很懒，什么都没写。')
    expect(store.avatar).toBe('🙂')
  })

  it('网络失败时置 loadError 且保留本地值，不抛错', async () => {
    const api = fakeApi({
      getProfile: vi.fn(async () => {
        throw new ApiError('NETWORK', '无法连接服务端', 0)
      })
    })
    const store = storeWith(api)

    await expect(store.load()).resolves.toBeUndefined()
    expect(store.loadError).toBe('无法连接服务端')
    expect(store.name).toBe('我')
    expect(store.loading).toBe(false)
  })

  it('失败后重试成功会清掉 loadError', async () => {
    const getProfile = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('NETWORK', '无法连接服务端', 0))
      .mockResolvedValueOnce({ name: '阿铁', bio: '简介', avatar: '🐼', joinedAt: NOW })
    const store = storeWith(fakeApi({ getProfile }))

    await store.load()
    expect(store.loadError).toBeTruthy()

    await store.load()
    expect(store.loadError).toBeNull()
    expect(store.name).toBe('阿铁')
  })
})

describe('profile store · update', () => {
  it('保存昵称与简介并同步服务端返回值', async () => {
    const api = fakeApi()
    const store = storeWith(api)

    await store.update({ name: '阿铁', bio: '在写代码，也在写字。' })

    expect(store.name).toBe('阿铁')
    expect(store.bio).toBe('在写代码，也在写字。')
    expect(api.updateProfile).toHaveBeenCalledWith({ name: '阿铁', bio: '在写代码，也在写字。' })
  })

  it('昵称超过 20 字被服务端截断后回写本地', async () => {
    const store = storeWith(fakeApi())
    await store.update({ name: 'a'.repeat(30) })
    expect(store.name).toHaveLength(20)
  })

  it('简介超过 60 字被服务端截断后回写本地', async () => {
    const store = storeWith(fakeApi())
    await store.update({ bio: 'b'.repeat(80) })
    expect(store.bio).toHaveLength(60)
  })

  it('昵称首尾空白被去掉', async () => {
    const store = storeWith(fakeApi())
    await store.update({ name: '  阿铁  ' })
    expect(store.name).toBe('阿铁')
  })

  it('昵称清空时回退为默认「我」', async () => {
    const store = storeWith(fakeApi())
    await store.update({ name: '有名' })
    await store.update({ name: '   ' })
    expect(store.name).toBe('我')
  })

  it('头像必须来自可选列表', async () => {
    const store = storeWith(fakeApi())
    await store.update({ avatar: '🦊' })
    expect(store.avatar).toBe('🦊')
  })

  it('非法头像被服务端拒绝时返回 false 且本地不变', async () => {
    const store = storeWith(fakeApi())
    await store.update({ avatar: '🦊' })

    const result = await store.update({ avatar: '💣' })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('头像')
    expect(store.avatar).toBe('🦊')
  })

  it('只传部分字段时只提交该字段，不影响其他字段', async () => {
    const api = fakeApi()
    const store = storeWith(api)
    await store.update({ name: '阿铁', bio: '简介', avatar: '🐼' })

    await store.update({ bio: '只改简介' })

    expect(api.updateProfile).toHaveBeenLastCalledWith({ bio: '只改简介' })
    expect(store.name).toBe('阿铁')
    expect(store.avatar).toBe('🐼')
    expect(store.bio).toBe('只改简介')
  })

  it('传入空对象/不传参时不发请求', async () => {
    const api = fakeApi()
    const store = storeWith(api)

    await expect(store.update({})).resolves.toEqual({ ok: true })
    await expect(store.update()).resolves.toEqual({ ok: true })
    expect(api.updateProfile).not.toHaveBeenCalled()
  })

  it('joinedAt 不可被 update 篡改', async () => {
    const store = storeWith(fakeApi())
    await store.load()
    const original = store.joinedAt

    await store.update({ joinedAt: 0, name: 'x' })
    expect(store.joinedAt).toBe(original)
  })

  it('网络失败时返回错误且本地资料不变', async () => {
    const api = fakeApi({
      updateProfile: vi.fn(async () => {
        throw new ApiError('NETWORK', '无法连接服务端', 0)
      })
    })
    const store = storeWith(api)

    const result = await store.update({ name: '改不动' })
    expect(result.ok).toBe(false)
    expect(result.error).toBe('无法连接服务端')
    expect(store.name).toBe('我')
  })
})

describe('profile store · 派生统计', () => {
  it('使用天数按服务端 joinedAt 的自然日计算', async () => {
    const store = storeWith(fakeApi({ initial: { name: 'x', joinedAt: NOW - 2 * DAY } }))
    await store.load()
    expect(store.daysUsed).toBe(3)
  })

  it('当天加入显示第 1 天', () => {
    expect(storeWith(fakeApi()).daysUsed).toBe(1)
  })

  it('最大可选头像列表长度为 10', () => {
    expect(storeWith(fakeApi()).avatars).toHaveLength(10)
  })

  it('isDefault 在服务端仍是初始资料时为 true', async () => {
    const store = storeWith(fakeApi())
    await store.load()
    expect(store.isDefault).toBe(true)
  })

  it('isDefault 在已自定义资料时为 false', async () => {
    const store = storeWith(fakeApi())
    await store.update({ name: '阿铁' })
    expect(store.isDefault).toBe(false)
  })
})

describe('profile store · restoreFromBackup', () => {
  it('资料仍是默认值时应用备份并返回 true', async () => {
    const store = storeWith(fakeApi())
    const applied = await store.restoreFromBackup({ name: '备份用户', bio: '来自备份', avatar: '🐼' })

    expect(applied).toBe(true)
    expect(store.name).toBe('备份用户')
    expect(store.avatar).toBe('🐼')
  })

  it('用户已自定义资料时返回 false 且不覆盖', async () => {
    const store = storeWith(fakeApi())
    await store.update({ name: '我改过的名字' })

    const applied = await store.restoreFromBackup({ name: '备份用户', avatar: '🐼' })
    expect(applied).toBe(false)
    expect(store.name).toBe('我改过的名字')
  })

  it('备份资料为空时不发请求并返回 false', async () => {
    const api = fakeApi()
    const store = storeWith(api)

    await expect(store.restoreFromBackup(null)).resolves.toBe(false)
    expect(api.restoreProfile).not.toHaveBeenCalled()
    expect(store.name).toBe('我')
  })

  it('备份里含非法头像时服务端报错，返回 false 且本地不变', async () => {
    const store = storeWith(fakeApi())
    await expect(store.restoreFromBackup({ name: '备份用户', avatar: '💣' })).resolves.toBe(false)
    expect(store.name).toBe('我')
  })

  it('网络失败时返回 false 并置 loadError', async () => {
    const api = fakeApi({
      restoreProfile: vi.fn(async () => {
        throw new ApiError('NETWORK', '无法连接服务端', 0)
      })
    })
    const store = storeWith(api)

    await expect(store.restoreFromBackup({ name: '备份用户' })).resolves.toBe(false)
    expect(store.loadError).toBe('无法连接服务端')
  })
})

describe('profile store · reset', () => {
  it('重置后回到默认资料，并把 joinedAt 更新为当下', async () => {
    const store = storeWith(fakeApi())
    await store.update({ name: '阿铁', avatar: '🐼' })

    vi.setSystemTime(NOW + 5 * DAY)
    await store.reset()

    expect(store.name).toBe('我')
    expect(store.avatar).toBe('🙂')
    expect(store.joinedAt).toBe(NOW + 5 * DAY)
    expect(store.daysUsed).toBe(1)
  })

  it('重置失败时保留原资料并置 loadError', async () => {
    const api = fakeApi({
      resetProfile: vi.fn(async () => {
        throw new ApiError('NETWORK', '无法连接服务端', 0)
      })
    })
    const store = storeWith(api)
    await store.update({ name: '阿铁' })

    await store.reset()
    expect(store.name).toBe('阿铁')
    expect(store.loadError).toBe('无法连接服务端')
  })
})

describe('profile store · 心情', () => {
  it('默认心情为「心情好」', () => {
    const store = storeWith(fakeApi())
    expect(store.mood).toBe('great')
  })

  it('从服务端载入心情', async () => {
    const store = storeWith(fakeApi({ initial: { mood: 'fired' } }))
    await store.load()
    expect(store.mood).toBe('fired')
  })

  it('setMood 更新本地并写到服务端', async () => {
    const api = fakeApi()
    const store = storeWith(api)
    await store.load()

    const result = await store.setMood('calm')

    expect(result.ok).toBe(true)
    expect(store.mood).toBe('calm')
    expect(api.updateProfile).toHaveBeenCalledWith({ mood: 'calm' })
  })

  it('白名单内每个心情都能设置', async () => {
    const store = storeWith(fakeApi())
    await store.load()

    for (const mood of MOODS) {
      const result = await store.setMood(mood.key)
      expect(result.ok).toBe(true)
      expect(store.mood).toBe(mood.key)
    }
  })

  it('非法心情键不会发给服务端（本地先挡，省一次必然 400 的请求）', async () => {
    const api = fakeApi()
    const store = storeWith(api)
    await store.load()

    const result = await store.setMood('happy')

    expect(result.ok).toBe(false)
    expect(api.updateProfile).not.toHaveBeenCalled()
    expect(store.mood).toBe('great')
  })

  it('【关键】服务端拒绝时回滚到原心情', async () => {
    const api = fakeApi()
    const store = storeWith(api)
    await store.load()

    api.updateProfile.mockRejectedValueOnce(new ApiError('NETWORK', '无法连接服务端', 0))
    const result = await store.setMood('down')

    expect(result.ok).toBe(false)
    expect(result.error).toContain('无法连接服务端')
    expect(store.mood).toBe('great')
  })

  it('切换心情不影响其他字段', async () => {
    const api = fakeApi({
      initial: { name: '阿铁', bio: '简介', avatar: '🦊' }
    })
    const store = storeWith(api)
    await store.load()

    await store.setMood('down')

    expect(store.name).toBe('阿铁')
    expect(store.bio).toBe('简介')
    expect(store.avatar).toBe('🦊')
  })

  it('服务端返回非法心情时本地回落到默认（不渲染空白）', async () => {
    const store = storeWith(fakeApi({ initial: { mood: 'bogus' } }))
    await store.load()

    expect(store.mood).toBe('great')
  })

  it('load 失败时心情保持默认而不是 undefined', async () => {
    const api = fakeApi()
    api.getProfile.mockRejectedValueOnce(new Error('离线'))
    const store = storeWith(api)

    await store.load()

    expect(store.mood).toBe('great')
  })

  it('reset 后心情回到默认', async () => {
    const store = storeWith(fakeApi())
    await store.load()
    await store.setMood('tired')

    await store.reset()

    expect(store.mood).toBe('great')
  })

  it('moodView 提供表情与文案供 UI 直接使用', async () => {
    const store = storeWith(fakeApi({ initial: { mood: 'fired' } }))
    await store.load()

    expect(store.moodView).toEqual({ key: 'fired', emoji: '🔥', label: '干劲满满' })
  })

  it('moodView 对非法心情回落默认，不抛错', () => {
    const store = storeWith(fakeApi())
    expect(store.moodView.emoji).toBe('😄')
  })
})

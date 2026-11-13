/**
 * profile store 测试（TDD）
 *
 * 关注点：
 * - 资料字段的边界（昵称 ≤20、简介 ≤60、头像白名单）
 * - 使用天数按 joinedAt 自然日计算
 * - 清空数据时资料回到默认值，但 joinedAt 重置为当下（新的一轮使用）
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useProfileStore } from './profile'
import { createStorage } from '@/services/storage'
import { setStorage } from '@/services/storage-context'

const NOW = new Date(2026, 10, 13, 10, 0, 0).getTime()
const DAY = 86_400_000

let storage

beforeEach(() => {
  setActivePinia(createPinia())
  storage = createStorage()
  setStorage(storage)
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  setStorage(null)
})

describe('profile store · 默认值', () => {
  it('首次使用时给出默认资料并落盘', () => {
    const store = useProfileStore()
    expect(store.name).toBe('我')
    expect(store.bio).toBe('这个人很懒，什么都没写。')
    expect(store.avatar).toBe('🙂')
    expect(store.joinedAt).toBe(NOW)
    expect(JSON.parse(storage.read('profile')).name).toBe('我')
  })

  it('从存储恢复已保存的资料', () => {
    storage.write(
      'profile',
      JSON.stringify({ name: '小记', bio: '简介', avatar: '🦊', joinedAt: NOW - 3 * DAY })
    )
    const store = useProfileStore()
    expect(store.name).toBe('小记')
    expect(store.avatar).toBe('🦊')
  })

  it('存储中资料损坏时回退默认值，不抛错', () => {
    storage.write('profile', '{{{bad')
    expect(() => useProfileStore()).not.toThrow()
    expect(useProfileStore().name).toBe('我')
  })

  it('存储中资料字段类型错误时逐项回退默认值', () => {
    storage.write('profile', JSON.stringify({ name: 123, bio: null, avatar: '', joinedAt: 'x' }))
    const store = useProfileStore()
    expect(store.name).toBe('我')
    expect(store.bio).toBe('这个人很懒，什么都没写。')
    expect(store.avatar).toBe('🙂')
    expect(store.joinedAt).toBe(NOW)
  })
})

describe('profile store · update', () => {
  it('保存昵称与简介并持久化', () => {
    const store = useProfileStore()
    store.update({ name: '阿铁', bio: '在写代码，也在写字。' })

    expect(store.name).toBe('阿铁')
    expect(store.bio).toBe('在写代码，也在写字。')
    expect(JSON.parse(storage.read('profile')).name).toBe('阿铁')
  })

  it('昵称超过 20 字被截断', () => {
    const store = useProfileStore()
    store.update({ name: 'a'.repeat(30) })
    expect(store.name).toHaveLength(20)
  })

  it('简介超过 60 字被截断', () => {
    const store = useProfileStore()
    store.update({ bio: 'b'.repeat(80) })
    expect(store.bio).toHaveLength(60)
  })

  it('昵称首尾空白被去掉', () => {
    const store = useProfileStore()
    store.update({ name: '  阿铁  ' })
    expect(store.name).toBe('阿铁')
  })

  it('昵称清空时回退为默认「我」', () => {
    const store = useProfileStore()
    store.update({ name: '有名' })
    store.update({ name: '   ' })
    expect(store.name).toBe('我')
  })

  it('头像必须来自可选列表，非法值被忽略', () => {
    const store = useProfileStore()
    store.update({ avatar: '🦊' })
    expect(store.avatar).toBe('🦊')

    store.update({ avatar: '💣' })
    expect(store.avatar).toBe('🦊')
  })

  it('只传部分字段时不影响其他字段', () => {
    const store = useProfileStore()
    store.update({ name: '阿铁', bio: '简介', avatar: '🐼' })
    store.update({ bio: '只改简介' })

    expect(store.name).toBe('阿铁')
    expect(store.avatar).toBe('🐼')
    expect(store.bio).toBe('只改简介')
  })

  it('传入空对象不报错', () => {
    const store = useProfileStore()
    expect(() => store.update({})).not.toThrow()
    expect(() => store.update()).not.toThrow()
  })

  it('joinedAt 不可被 update 篡改', () => {
    const store = useProfileStore()
    const original = store.joinedAt
    store.update({ joinedAt: 0, name: 'x' })
    expect(store.joinedAt).toBe(original)
  })
})

describe('profile store · 派生统计', () => {
  it('使用天数按 joinedAt 的自然日计算', () => {
    storage.write('profile', JSON.stringify({ name: 'x', joinedAt: NOW - 2 * DAY }))
    expect(useProfileStore().daysUsed).toBe(3)
  })

  it('当天加入显示第 1 天', () => {
    expect(useProfileStore().daysUsed).toBe(1)
  })

  it('最大可选头像列表长度为 10', () => {
    expect(useProfileStore().avatars).toHaveLength(10)
  })
})

describe('profile store · restoreFromBackup', () => {
  it('仅在资料仍是默认值时采用备份资料', () => {
    const store = useProfileStore()
    const applied = store.restoreFromBackup({ name: '备份用户', bio: '来自备份', avatar: '🐼' })

    expect(applied).toBe(true)
    expect(store.name).toBe('备份用户')
  })

  it('用户已自定义资料时不覆盖', () => {
    const store = useProfileStore()
    store.update({ name: '我改过的名字' })

    const applied = store.restoreFromBackup({ name: '备份用户', avatar: '🐼' })
    expect(applied).toBe(false)
    expect(store.name).toBe('我改过的名字')
  })

  it('备份资料为空时不覆盖', () => {
    const store = useProfileStore()
    expect(store.restoreFromBackup(null)).toBe(false)
    expect(store.name).toBe('我')
  })

  it('改过头像也算已自定义，不被覆盖', () => {
    const store = useProfileStore()
    store.update({ avatar: '🦊' })
    expect(store.restoreFromBackup({ name: '备份用户' })).toBe(false)
    expect(store.name).toBe('我')
  })
})

describe('profile store · reset', () => {
  it('重置后回到默认资料，并把 joinedAt 更新为当下', () => {
    const store = useProfileStore()
    store.update({ name: '阿铁', avatar: '🐼' })

    vi.setSystemTime(NOW + 5 * DAY)
    store.reset()

    expect(store.name).toBe('我')
    expect(store.avatar).toBe('🙂')
    expect(store.joinedAt).toBe(NOW + 5 * DAY)
    expect(store.daysUsed).toBe(1)
  })
})

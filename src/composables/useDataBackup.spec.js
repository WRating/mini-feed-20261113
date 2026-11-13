/**
 * 数据备份 composable 测试（TDD）
 *
 * 它是 posts / profile 两个 store 的协调者：
 * - 导出：把两个 store 的当前状态组装成备份文件并触发下载
 * - 导入：解析 → 合并动态 → 按规则恢复资料 → 返回可展示的结果
 * - 清空：两个 store 一起清，保证不留半截状态
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useDataBackup } from './useDataBackup'
import { usePostsStore } from '@/stores/posts'
import { useProfileStore } from '@/stores/profile'
import { createStorage } from '@/services/storage'
import { setStorage } from '@/services/storage-context'

const NOW = new Date(2026, 10, 13, 10, 0, 0).getTime()

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

describe('useDataBackup · exportBackup', () => {
  it('组装出带动态与资料的备份对象', () => {
    const posts = usePostsStore()
    const profile = useProfileStore()
    posts.publish('第一条')
    profile.update({ name: '小记' })

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

  it('下载流程调用了浏览器能力，且不抛错', () => {
    const posts = usePostsStore()
    posts.publish('内容')

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

  it('导入合法文件：动态被合并，资料被恢复', () => {
    const posts = usePostsStore()
    const profile = useProfileStore()

    const result = useDataBackup().importBackup(validFile)

    expect(result.ok).toBe(true)
    expect(result.added).toBe(2)
    expect(posts.count).toBe(2)
    expect(profile.name).toBe('备份用户')
  })

  it('导入与已有的重复动态会被跳过', () => {
    const posts = usePostsStore()
    const existing = posts.publish('已存在')

    const file = JSON.stringify({
      posts: [{ ...existing.post, id: 'dup-id' }, { id: 'new', text: '新的', createdAt: NOW + 1000 }]
    })
    const result = useDataBackup().importBackup(file)

    expect(result.added).toBe(1)
    expect(result.skipped).toBe(1)
    expect(posts.count).toBe(2)
  })

  it('用户已自定义资料时不被备份覆盖', () => {
    const profile = useProfileStore()
    profile.update({ name: '我改过的名字' })

    const result = useDataBackup().importBackup(validFile)
    expect(result.ok).toBe(true)
    expect(result.profileRestored).toBe(false)
    expect(profile.name).toBe('我改过的名字')
  })

  it('非法 JSON 返回失败且不改动任何数据', () => {
    const posts = usePostsStore()
    posts.publish('原有')

    const result = useDataBackup().importBackup('不是 JSON{{')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('JSON')
    expect(posts.count).toBe(1)
  })

  it('缺少 posts 字段返回失败', () => {
    const result = useDataBackup().importBackup(JSON.stringify({ foo: 1 }))
    expect(result.ok).toBe(false)
    expect(result.error).toContain('posts')
  })

  it('文件为空时返回失败', () => {
    const result = useDataBackup().importBackup('')
    expect(result.ok).toBe(false)
  })

  it('非法文件不会写入存储', () => {
    useDataBackup().importBackup('{{bad')
    expect(storage.read('posts')).toBeNull()
  })

  it('部分条目非法时导入合法部分并报告跳过数', () => {
    const file = JSON.stringify({
      posts: [{ id: 'a', text: 'ok', createdAt: 1 }, { junk: true }]
    })
    const result = useDataBackup().importBackup(file)
    expect(result.ok).toBe(true)
    expect(result.added).toBe(1)
    expect(result.skipped).toBe(1)
  })

  it('导入后动态按时间倒序排列', () => {
    const posts = usePostsStore()
    posts.publish('本地的')

    useDataBackup().importBackup(validFile)
    expect(posts.posts[0].text).toBe('备份里的动态')
  })
})

describe('useDataBackup · clearAll', () => {
  it('同时清空动态与资料', () => {
    const posts = usePostsStore()
    const profile = useProfileStore()
    posts.publish('a')
    posts.publish('b')
    profile.update({ name: '阿铁', avatar: '🐼' })

    useDataBackup().clearAll()

    expect(posts.count).toBe(0)
    expect(profile.name).toBe('我')
    expect(profile.avatar).toBe('🙂')
    expect(JSON.parse(storage.read('posts'))).toEqual([])
  })

  it('清空后使用天数重新从第 1 天算', () => {
    const profile = useProfileStore()
    vi.setSystemTime(NOW + 10 * 86_400_000)
    useDataBackup().clearAll()
    expect(profile.daysUsed).toBe(1)
  })
})

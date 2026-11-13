/**
 * App 集成测试（TDD）
 *
 * 用真实 store + 真实组件，只替换**网络层**（注入 fake api-client）与时间。
 * 这样既能覆盖完整的用户流程，又不依赖真实后端进程。
 *
 * 相比 LocalStorage 版本，这里多了必须覆盖的新场景：
 * - 服务端不可达时的降级（告警条 + 重试）
 * - **发布失败时输入框内容必须保留**（这是异步化最容易丢数据的地方）
 * - 首次加载态与加载完成态的区分
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import App from './App.vue'
import { setPostsApiFactory, resetPostsApiFactory } from '@/stores/posts'
import { setProfileApiFactory, resetProfileApiFactory } from '@/stores/profile'
import { setStatsApiFactory, resetStatsApiFactory } from '@/composables/useServerStats'
import { setWeatherServiceFactory, resetWeatherServiceFactory } from '@/stores/weather'
import { normalizeReactions, toggleReaction } from '@shared/post-shape'

const NOW = new Date(2026, 10, 13, 10, 0, 0).getTime()
const find = (wrapper, testid) => wrapper.find(`[data-testid="${testid}"]`)
/** 首页与个人中心同时存在于 DOM（v-show），查询需限定范围 */
const home = (wrapper) => wrapper.find('[data-testid="home-timeline"]')
const homeFind = (wrapper, testid) => home(wrapper).find(`[data-testid="${testid}"]`)
const homeFindAll = (wrapper, testid) => home(wrapper).findAll(`[data-testid="${testid}"]`)

/**
 * 内存版「后端」替身 —— 模拟服务端行为（trim、倒序、去重、资料默认值保护）。
 * 刻意实现成有状态的：这样才能测出「写成功后本地与远端一致」这类问题。
 */
function createFakeBackend() {
  const state = {
    posts: [],
    profile: { name: '我', bio: '这个人很懒，什么都没写。', avatar: '🙂', joinedAt: NOW },
    failNext: null
  }

  let seq = 0
  const sorted = () => [...state.posts].sort((a, b) => b.createdAt - a.createdAt)

  function maybeThrow() {
    if (state.failNext) {
      const error = new Error(state.failNext.message || '请求失败')
      error.code = state.failNext.code || 'NETWORK'
      state.failNext = null
      throw error
    }
  }

  return {
    state,
    /** 让下一次调用失败 */
    failNextWith(message, code = 'NETWORK') {
      state.failNext = { message, code }
    },

    getStats: vi.fn(async () => {
      maybeThrow()
      const totals = state.posts.reduce(
        (acc, p) => {
          const { likes, favorites } = normalizeReactions(p)
          acc.likes += likes
          acc.favorites += favorites
          return acc
        },
        { likes: 0, favorites: 0 }
      )
      return {
        posts: state.posts.length,
        chars: state.posts.reduce((s, p) => s + p.text.length, 0),
        bytes: 812,
        likes: totals.likes,
        favorites: totals.favorites
      }
    }),

    listPosts: vi.fn(async () => {
      maybeThrow()
      return sorted()
    }),

    createPost: vi.fn(async (text) => {
      maybeThrow()
      const trimmed = String(text).trim()
      if (!trimmed) {
        const error = new Error('内容不能为空')
        error.code = 'EMPTY'
        throw error
      }
      if (trimmed.length > 280) {
        const error = new Error('内容不能超过 280 字')
        error.code = 'TOO_LONG'
        throw error
      }
      seq += 1
      // 契约 4.4：新动态的互动字段全为 0 / false
      const post = {
        id: `srv-${seq}`,
        text: trimmed,
        createdAt: Date.now(),
        likes: 0,
        favorites: 0,
        liked: false,
        favorited: false
      }
      state.posts.push(post)
      return post
    }),

    getPost: vi.fn(async (id) => {
      maybeThrow()
      const found = state.posts.find((p) => p.id === id)
      if (!found) {
        const error = new Error('动态不存在')
        error.code = 'NOT_FOUND'
        throw error
      }
      return found
    }),

    removePost: vi.fn(async (id) => {
      maybeThrow()
      const before = state.posts.length
      state.posts = state.posts.filter((p) => p.id !== id)
      if (state.posts.length === before) {
        const error = new Error('动态不存在')
        error.code = 'NOT_FOUND'
        throw error
      }
      return undefined
    }),

    mergePosts: vi.fn(async (items) => {
      maybeThrow()
      let added = 0
      let skipped = 0
      const keys = new Set(state.posts.map((p) => `${p.text}@${p.createdAt}`))
      ;(items || []).forEach((raw, index) => {
        if (!raw || typeof raw.text !== 'string' || !Number.isFinite(raw.createdAt)) {
          skipped += 1
          return
        }
        const text = raw.text.trim().slice(0, 280)
        if (!text) {
          skipped += 1
          return
        }
        const key = `${text}@${raw.createdAt}`
        if (keys.has(key)) {
          skipped += 1
          return
        }
        keys.add(key)
        state.posts.push({
          id: raw.id || `imported-${raw.createdAt}-${index}`,
          text,
          createdAt: raw.createdAt
        })
        added += 1
      })
      return { added, skipped, posts: sorted() }
    }),

    clearPosts: vi.fn(async () => {
      maybeThrow()
      state.posts = []
      return undefined
    }),

    getProfile: vi.fn(async () => {
      maybeThrow()
      return { ...state.profile }
    }),

    updateProfile: vi.fn(async (patch) => {
      maybeThrow()
      if (patch.name !== undefined) {
        const name = String(patch.name).trim().slice(0, 20)
        state.profile.name = name || '我'
      }
      if (patch.bio !== undefined) state.profile.bio = String(patch.bio).trim().slice(0, 60)
      if (patch.avatar !== undefined) state.profile.avatar = patch.avatar
      return { ...state.profile }
    }),

    restoreProfile: vi.fn(async (source) => {
      maybeThrow()
      const isDefault =
        state.profile.name === '我' &&
        state.profile.bio === '这个人很懒，什么都没写。' &&
        state.profile.avatar === '🙂'
      if (!isDefault) return { applied: false, profile: { ...state.profile } }

      if (typeof source?.name === 'string' && source.name.trim()) {
        state.profile.name = source.name.trim().slice(0, 20)
      }
      if (typeof source?.bio === 'string' && source.bio.trim()) {
        state.profile.bio = source.bio.trim().slice(0, 60)
      }
      if (typeof source?.avatar === 'string') state.profile.avatar = source.avatar
      return { applied: true, profile: { ...state.profile } }
    }),

    // 契约 4.13：切换互动状态，返回更新后的完整 Post（服务端是唯一权威）
    setReaction: vi.fn(async (id, kind) => {
      maybeThrow()
      const found = state.posts.find((p) => p.id === id)
      if (!found) {
        const error = new Error('动态不存在')
        error.code = 'NOT_FOUND'
        throw error
      }
      const next = { ...normalizeReactions(found), ...toggleReaction(found, kind) }
      Object.assign(found, next)
      return { ...found }
    }),

    resetProfile: vi.fn(async () => {
      maybeThrow()
      state.profile = { name: '我', bio: '这个人很懒，什么都没写。', avatar: '🙂', joinedAt: Date.now() }
      return { ...state.profile }
    })
  }
}

function stubWeather() {
  setWeatherServiceFactory(() => ({
    load: async () => ({
      ok: true,
      place: '长沙市 · 湖南省',
      weather: { temp: 14, apparent: 15, humidity: 95, code: 51, icon: '🌦️', label: '毛毛雨' },
      error: null
    })
  }))
}

let backend
let wrapper

async function mountApp() {
  wrapper = mount(App, { attachTo: document.body })
  // 等待 onMounted 里的并发加载完成
  await flush()
  await flush()
  return wrapper
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  setActivePinia(createPinia())
  backend = createFakeBackend()
  setPostsApiFactory(() => backend)
  setProfileApiFactory(() => backend)
  setStatsApiFactory(() => backend)
  stubWeather()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  wrapper?.unmount()
  vi.useRealTimers()
  resetPostsApiFactory()
  resetProfileApiFactory()
  resetStatsApiFactory()
  resetWeatherServiceFactory()
})

describe('App · 首屏加载', () => {
  it('挂载后从服务端拉取动态', async () => {
    backend.state.posts.push({ id: 'a', text: '来自服务端', createdAt: NOW })
    await mountApp()

    expect(homeFind(wrapper, 'post-text').text()).toBe('来自服务端')
    expect(backend.listPosts).toHaveBeenCalled()
  })

  it('服务端无数据时展示空状态', async () => {
    await mountApp()
    expect(homeFind(wrapper, 'empty-state').exists()).toBe(true)
  })

  it('挂载时同时拉取资料与统计', async () => {
    await mountApp()
    expect(backend.getProfile).toHaveBeenCalled()
    expect(backend.getStats).toHaveBeenCalled()
  })

  it('加载完成后不再显示加载态', async () => {
    await mountApp()
    expect(find(wrapper, 'loading-state').exists()).toBe(false)
  })

  it('资料从服务端恢复', async () => {
    backend.state.profile.name = '服务端用户'
    await mountApp()
    expect(find(wrapper, 'profile-name').text()).toBe('服务端用户')
  })

  it('统计展示服务端数据量', async () => {
    backend.state.posts.push({ id: 'a', text: 'abc', createdAt: NOW })
    await mountApp()

    await find(wrapper, 'tab-profile').trigger('click')
    expect(find(wrapper, 'storage-text').text()).toContain('服务端数据')
    expect(find(wrapper, 'storage-text').text()).toContain('1 条动态')
  })
})

describe('App · 发布', () => {
  it('发布成功后出现在列表中，并写入服务端', async () => {
    await mountApp()

    await find(wrapper, 'composer-input').setValue('新动态')
    await find(wrapper, 'publish-btn').trigger('click')
    await flush()

    expect(homeFind(wrapper, 'post-text').text()).toBe('新动态')
    expect(backend.state.posts).toHaveLength(1)
    expect(backend.state.posts[0].text).toBe('新动态')
  })

  it('发布成功后清空输入框', async () => {
    await mountApp()

    await find(wrapper, 'composer-input').setValue('要清空的')
    await find(wrapper, 'publish-btn').trigger('click')
    await flush()

    expect(find(wrapper, 'composer-input').element.value).toBe('')
  })

  it('连续发布按时间倒序', async () => {
    await mountApp()

    await find(wrapper, 'composer-input').setValue('早')
    await find(wrapper, 'publish-btn').trigger('click')
    await flush()
    vi.setSystemTime(NOW + 1000)

    await find(wrapper, 'composer-input').setValue('晚')
    await find(wrapper, 'publish-btn').trigger('click')
    await flush()

    const texts = homeFindAll(wrapper, 'post-text').map((el) => el.text())
    expect(texts).toEqual(['晚', '早'])
  })

  it('空内容不发请求', async () => {
    await mountApp()

    await find(wrapper, 'composer-input').setValue('   ')
    // 按钮此时是禁用的，直接提交也不会触发
    expect(find(wrapper, 'publish-btn').attributes('disabled')).toBeDefined()
    expect(backend.createPost).not.toHaveBeenCalled()
  })

  it('服务端拒绝时展示错误且不写入列表', async () => {
    await mountApp()

    await find(wrapper, 'composer-input').setValue('会被拒绝')
    backend.failNextWith('内容不能超过 280 字', 'TOO_LONG')
    await find(wrapper, 'publish-btn').trigger('click')
    await flush()

    expect(find(wrapper, 'toast').text()).toContain('280')
    expect(homeFindAll(wrapper, 'post-text')).toHaveLength(0)
  })

  it('【防回归】发布失败时输入框内容必须保留', async () => {
    await mountApp()

    await find(wrapper, 'composer-input').setValue('这段文字不能丢')
    backend.failNextWith('无法连接服务端')
    await find(wrapper, 'publish-btn').trigger('click')
    await flush()

    // 这是异步化后最容易丢数据的地方：组件自己清空就会吞掉用户输入
    expect(find(wrapper, 'composer-input').element.value).toBe('这段文字不能丢')
  })

  it('发布失败后可以重新提交成功', async () => {
    await mountApp()

    await find(wrapper, 'composer-input').setValue('重试内容')
    backend.failNextWith('网络抖动')
    await find(wrapper, 'publish-btn').trigger('click')
    await flush()

    await find(wrapper, 'publish-btn').trigger('click')
    await flush()

    expect(homeFind(wrapper, 'post-text').text()).toBe('重试内容')
    expect(find(wrapper, 'composer-input').element.value).toBe('')
  })

  it('发布过程中按钮禁用并显示进行中文案', async () => {
    await mountApp()

    let release
    backend.createPost.mockImplementationOnce(
      () => new Promise((resolve) => {
        release = () => resolve({ id: 'slow', text: '慢请求', createdAt: NOW })
      })
    )

    await find(wrapper, 'composer-input').setValue('慢请求')
    await find(wrapper, 'publish-btn').trigger('click')
    await wrapper.vm.$nextTick()

    expect(find(wrapper, 'publish-btn').attributes('disabled')).toBeDefined()
    expect(find(wrapper, 'publish-btn').text()).toContain('发布中')

    release()
    await flush()
  })
})

describe('App · 详情与删除', () => {
  it('点击卡片进入详情页', async () => {
    backend.state.posts.push({ id: 'a', text: '详情内容', createdAt: NOW })
    await mountApp()

    await homeFind(wrapper, 'open-btn').trigger('click')

    expect(find(wrapper, 'detail-text').text()).toBe('详情内容')
    expect(find(wrapper, 'detail-chars').text()).toContain('4 字')
  })

  it('删除成功后从列表移除并通知服务端', async () => {
    backend.state.posts.push({ id: 'a', text: '待删除', createdAt: NOW })
    await mountApp()

    await homeFind(wrapper, 'delete-btn').trigger('click')
    await flush()

    expect(backend.removePost).toHaveBeenCalledWith('a')
    expect(homeFind(wrapper, 'empty-state').exists()).toBe(true)
  })

  it('取消确认时不发删除请求', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    backend.state.posts.push({ id: 'a', text: '不要删', createdAt: NOW })
    await mountApp()

    await homeFind(wrapper, 'delete-btn').trigger('click')
    await flush()

    expect(confirmSpy).toHaveBeenCalled()
    expect(backend.removePost).not.toHaveBeenCalled()
    expect(homeFind(wrapper, 'post-text').text()).toBe('不要删')
  })

  it('删除失败时列表不变并提示错误', async () => {
    backend.state.posts.push({ id: 'a', text: '删不掉', createdAt: NOW })
    await mountApp()

    backend.failNextWith('服务端错误', 'INTERNAL')
    await homeFind(wrapper, 'delete-btn').trigger('click')
    await flush()

    expect(homeFind(wrapper, 'post-text').text()).toBe('删不掉')
    expect(find(wrapper, 'toast').text()).toContain('失败')
  })

  it('在详情页删除后回到首页', async () => {
    backend.state.posts.push({ id: 'a', text: '详情删除', createdAt: NOW })
    await mountApp()

    await homeFind(wrapper, 'open-btn').trigger('click')
    await find(wrapper, 'delete-btn').trigger('click')
    await flush()

    expect(find(wrapper, 'composer-input').exists()).toBe(true)
    expect(homeFind(wrapper, 'empty-state').exists()).toBe(true)
  })
})

describe('App · 连接失败降级', () => {
  it('首次加载失败时展示连接告警条', async () => {
    backend.failNextWith('无法连接服务端')
    await mountApp()

    expect(find(wrapper, 'connection-warning').exists()).toBe(true)
    expect(find(wrapper, 'connection-warning-text').text()).toContain('无法连接服务端')
  })

  it('连接正常时不展示告警条', async () => {
    await mountApp()
    expect(find(wrapper, 'connection-warning').exists()).toBe(false)
  })

  it('点击重试会重新拉取数据', async () => {
    backend.failNextWith('无法连接服务端')
    await mountApp()

    backend.listPosts.mockClear()
    // 让后续请求恢复正常
    await find(wrapper, 'retry-btn').trigger('click')
    await flush()
    await flush()

    expect(backend.listPosts).toHaveBeenCalled()
  })

  it('重试成功后告警条消失', async () => {
    backend.failNextWith('无法连接服务端')
    await mountApp()
    expect(find(wrapper, 'connection-warning').exists()).toBe(true)

    await find(wrapper, 'retry-btn').trigger('click')
    await flush()
    await flush()

    expect(find(wrapper, 'connection-warning').exists()).toBe(false)
  })

  it('可打开启动指引面板并关闭', async () => {
    backend.failNextWith('无法连接服务端')
    await mountApp()

    await find(wrapper, 'help-btn').trigger('click')
    expect(find(wrapper, 'help-dialog').exists()).toBe(true)

    await find(wrapper, 'help-close-btn').trigger('click')
    expect(find(wrapper, 'help-dialog').exists()).toBe(false)
  })

  it('【关键底线】连接失败时页面仍可用，能输入内容', async () => {
    backend.failNextWith('无法连接服务端')
    await mountApp()

    await find(wrapper, 'composer-input').setValue('离线也能打字')
    expect(find(wrapper, 'composer-input').element.value).toBe('离线也能打字')
  })
})

describe('App · 个人中心', () => {
  it('展示统计信息', async () => {
    backend.state.posts.push({ id: 'a', text: 'abc', createdAt: NOW })
    backend.state.posts.push({ id: 'b', text: 'de', createdAt: NOW + 1 })
    await mountApp()

    await find(wrapper, 'tab-profile').trigger('click')

    expect(find(wrapper, 'stat-posts').text()).toBe('2')
    expect(find(wrapper, 'stat-chars').text()).toBe('5')
  })

  it('保存资料后同步到服务端与卡片作者名', async () => {
    backend.state.posts.push({ id: 'a', text: '内容', createdAt: NOW })
    await mountApp()

    await find(wrapper, 'tab-profile').trigger('click')
    await find(wrapper, 'edit-btn').trigger('click')
    await find(wrapper, 'name-input').setValue('阿铁')
    await find(wrapper, 'save-btn').trigger('click')
    await flush()

    expect(backend.state.profile.name).toBe('阿铁')

    await find(wrapper, 'tab-home').trigger('click')
    expect(homeFind(wrapper, 'post-author').text()).toBe('阿铁')
  })

  it('资料保存失败时提示且不改本地', async () => {
    await mountApp()

    await find(wrapper, 'tab-profile').trigger('click')
    await find(wrapper, 'edit-btn').trigger('click')
    await find(wrapper, 'name-input').setValue('不会生效')
    backend.failNextWith('保存失败')
    await find(wrapper, 'save-btn').trigger('click')
    await flush()

    expect(find(wrapper, 'toast').text()).toContain('失败')
    expect(find(wrapper, 'profile-name').text()).toBe('我')
  })
})

describe('App · 数据备份', () => {
  it('导出触发下载并提示条数', async () => {
    const originalCreate = URL.createObjectURL
    const originalRevoke = URL.revokeObjectURL
    URL.createObjectURL = vi.fn(() => 'blob:mock')
    URL.revokeObjectURL = vi.fn()

    try {
      backend.state.posts.push({ id: 'a', text: '要备份的', createdAt: NOW })
      await mountApp()

      await find(wrapper, 'tab-profile').trigger('click')
      await find(wrapper, 'export-btn').trigger('click')

      expect(find(wrapper, 'toast').text()).toContain('已导出 1 条动态')
    } finally {
      URL.createObjectURL = originalCreate
      URL.revokeObjectURL = originalRevoke
    }
  })

  it('导入非法文件时提示失败且数据不变', async () => {
    backend.state.posts.push({ id: 'a', text: '原有', createdAt: NOW })
    await mountApp()
    await find(wrapper, 'tab-profile').trigger('click')

    const file = new File(['不是 JSON{{'], 'bad.json', { type: 'application/json' })
    const input = find(wrapper, 'import-file')
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')

    await vi.waitFor(() => {
      expect(find(wrapper, 'toast').text()).toContain('失败')
    })
    expect(backend.state.posts).toHaveLength(1)
  })

  it('导入合法备份时合并到服务端', async () => {
    await mountApp()
    await find(wrapper, 'tab-profile').trigger('click')

    const payload = JSON.stringify({
      app: 'minifeed',
      version: 1,
      posts: [{ id: 'x', text: '来自备份', createdAt: NOW + 60000 }],
      profile: { name: '备份用户' }
    })
    const file = new File([payload], 'good.json', { type: 'application/json' })
    const input = find(wrapper, 'import-file')
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')

    await vi.waitFor(() => {
      expect(find(wrapper, 'toast').text()).toContain('已导入 1 条动态')
    })
    expect(backend.mergePosts).toHaveBeenCalled()
    expect(backend.state.posts).toHaveLength(1)
  })

  it('清空数据后动态归零', async () => {
    backend.state.posts.push({ id: 'a', text: '要被清掉', createdAt: NOW })
    await mountApp()
    await find(wrapper, 'tab-profile').trigger('click')

    await find(wrapper, 'clear-btn').trigger('click')
    await find(wrapper, 'clear-confirm-btn').trigger('click')
    await flush()

    expect(backend.state.posts).toHaveLength(0)
    await find(wrapper, 'tab-home').trigger('click')
    expect(homeFind(wrapper, 'empty-state').exists()).toBe(true)
  })
})

describe('App · 视图切换', () => {
  it('两个标签页之间来回切换', async () => {
    await mountApp()

    await find(wrapper, 'tab-profile').trigger('click')
    expect(find(wrapper, 'profile-name').exists()).toBe(true)

    await find(wrapper, 'tab-home').trigger('click')
    expect(find(wrapper, 'composer-input').exists()).toBe(true)
  })

  it('Esc 从详情页返回首页', async () => {
    backend.state.posts.push({ id: 'a', text: 'esc 测试', createdAt: NOW })
    await mountApp()
    await homeFind(wrapper, 'open-btn').trigger('click')

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()

    expect(find(wrapper, 'composer-input').exists()).toBe(true)
  })
})

describe('App · 点赞与收藏', () => {
  it('点击点赞后本地立刻高亮，并同步到服务端', async () => {
    backend.state.posts.push({ id: 'a', text: '点赞我', createdAt: NOW })
    await mountApp()

    await homeFind(wrapper, 'like-btn').trigger('click')
    await flush()

    expect(backend.setReaction).toHaveBeenCalledWith('a', 'like')
    expect(homeFind(wrapper, 'like-btn').classes()).toContain('is-active')
    expect(homeFind(wrapper, 'like-count').text()).toBe('1')
    expect(backend.state.posts[0].liked).toBe(true)
  })

  it('点击收藏后同步到服务端', async () => {
    backend.state.posts.push({ id: 'a', text: '收藏我', createdAt: NOW })
    await mountApp()

    await homeFind(wrapper, 'favorite-btn').trigger('click')
    await flush()

    expect(backend.setReaction).toHaveBeenCalledWith('a', 'favorite')
    expect(homeFind(wrapper, 'favorite-btn').classes()).toContain('is-active')
    expect(backend.state.posts[0].favorited).toBe(true)
  })

  it('再次点击取消互动', async () => {
    backend.state.posts.push({ id: 'a', text: '切换我', createdAt: NOW })
    await mountApp()

    await homeFind(wrapper, 'like-btn').trigger('click')
    await flush()
    expect(backend.state.posts[0].liked).toBe(true)

    await homeFind(wrapper, 'like-btn').trigger('click')
    await flush()

    expect(backend.state.posts[0].liked).toBe(false)
    expect(homeFind(wrapper, 'like-count').text()).toBe('0')
  })

  it('【防回归】点赞不会打开详情页', async () => {
    backend.state.posts.push({ id: 'a', text: '不要跳走', createdAt: NOW })
    await mountApp()

    await homeFind(wrapper, 'like-btn').trigger('click')
    await flush()

    expect(find(wrapper, 'detail-text').exists()).toBe(false)
    expect(find(wrapper, 'composer-input').exists()).toBe(true)
  })

  it('失败时回滚并 toast 提示错误', async () => {
    backend.state.posts.push({ id: 'a', text: '会失败', createdAt: NOW })
    await mountApp()

    backend.failNextWith('无法连接服务端')
    await homeFind(wrapper, 'like-btn').trigger('click')
    await flush()

    expect(find(wrapper, 'toast').text()).toContain('无法连接服务端')
    expect(homeFind(wrapper, 'like-btn').classes()).not.toContain('is-active')
    expect(homeFind(wrapper, 'like-count').text()).toBe('0')
  })

  it('请求进行中时按钮禁用（防止快速双击把计数打翻）', async () => {
    backend.state.posts.push({ id: 'a', text: '慢请求', createdAt: NOW })
    await mountApp()

    let release
    backend.setReaction.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({ id: 'a', text: '慢请求', createdAt: NOW, likes: 1, favorites: 0, liked: true, favorited: false })
        })
    )

    await homeFind(wrapper, 'like-btn').trigger('click')
    await wrapper.vm.$nextTick()

    expect(homeFind(wrapper, 'like-btn').attributes('disabled')).toBeDefined()

    release()
    await flush()
    expect(homeFind(wrapper, 'like-btn').attributes('disabled')).toBeUndefined()
  })

  it('详情页的互动按钮同步回列表（同一份 store 状态）', async () => {
    backend.state.posts.push({ id: 'a', text: '详情互动', createdAt: NOW })
    await mountApp()

    await homeFind(wrapper, 'open-btn').trigger('click')
    await find(wrapper, 'like-btn').trigger('click')
    await flush()

    expect(find(wrapper, 'like-btn').classes()).toContain('is-active')
    expect(backend.state.posts[0].liked).toBe(true)

    // 返回首页后卡片也应是已点赞（同一条数据）
    await find(wrapper, 'detail-text').trigger('click')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()

    expect(homeFind(wrapper, 'like-btn').classes()).toContain('is-active')
  })

  it('互动后刷新统计，个人中心展示累计数', async () => {
    backend.state.posts.push({ id: 'a', text: '统计我', createdAt: NOW })
    await mountApp()

    await homeFind(wrapper, 'like-btn').trigger('click')
    await flush()

    await find(wrapper, 'tab-profile').trigger('click')
    const text = find(wrapper, 'storage-text').text()
    expect(text).toContain('1 赞')
    expect(text).toContain('0 收藏')
  })
})

describe('App · 天气卡片', () => {
  it('展示天气信息', async () => {
    await mountApp()
    await flush()
    await wrapper.vm.$nextTick()

    expect(find(wrapper, 'weather-location').text()).toContain('长沙市')
    expect(find(wrapper, 'weather-temp').text()).toBe('14°')
  })

  it('天气失败不影响动态功能', async () => {
    setWeatherServiceFactory(() => ({
      load: async () => ({ ok: false, place: '位置未知', weather: null, error: 'down' })
    }))
    backend.state.posts.push({ id: 'a', text: '动态照常', createdAt: NOW })
    await mountApp()

    expect(homeFind(wrapper, 'post-text').text()).toBe('动态照常')
  })
})

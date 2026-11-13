/**
 * App 集成测试（TDD）
 *
 * 用真实 store + 真实组件（只替换天气服务，避免联网），
 * 从用户视角走完整流程：发布 → 查看 → 详情 → 删除 → 个人中心 → 备份。
 * 这类测试最能防止「重构后功能坏掉」。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import App from './App.vue'
import { createStorage } from '@/services/storage'
import { setStorage } from '@/services/storage-context'
import { setWeatherServiceFactory, resetWeatherServiceFactory } from '@/stores/weather'

const NOW = new Date(2026, 10, 13, 10, 0, 0).getTime()
const find = (wrapper, testid) => wrapper.find(`[data-testid="${testid}"]`)
/** 首页与个人中心同时存在于 DOM（v-show），查询需限定范围 */
const home = (wrapper) => wrapper.find('[data-testid="home-timeline"]')
const homeFind = (wrapper, testid) => home(wrapper).find(`[data-testid="${testid}"]`)
const homeFindAll = (wrapper, testid) => home(wrapper).findAll(`[data-testid="${testid}"]`)

/** 天气服务替身，避免测试联网 */
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

let storage
let wrapper

async function mountApp() {
  wrapper = mount(App, { attachTo: document.body })
  await flush()
  return wrapper
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  setActivePinia(createPinia())
  storage = createStorage()
  setStorage(storage)
  stubWeather()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  wrapper?.unmount()
  vi.useRealTimers()
  setStorage(null)
  resetWeatherServiceFactory()
})

describe('App · 发布与查看', () => {
  it('默认展示首页，输入框与按钮就绪', async () => {
    await mountApp()
    expect(find(wrapper, 'composer-input').exists()).toBe(true)
    expect(find(wrapper, 'publish-btn').attributes('disabled')).toBeDefined()
  })

  it('空列表展示空状态', async () => {
    await mountApp()
    expect(find(wrapper, 'empty-state').exists()).toBe(true)
  })

  it('发布一条动态后出现在列表中，空状态消失', async () => {
    await mountApp()

    await find(wrapper, 'composer-input').setValue('集成测试：第一条')
    await find(wrapper, 'publish-btn').trigger('click')

    expect(homeFind(wrapper, 'post-text').text()).toBe('集成测试：第一条')
    expect(homeFind(wrapper, 'empty-state').exists()).toBe(false)
    expect(find(wrapper, 'post-count').text()).toBe('1 条')
  })

  it('发布后数据写入 localStorage 并可跨实例恢复', async () => {
    await mountApp()
    await find(wrapper, 'composer-input').setValue('要持久化')
    await find(wrapper, 'publish-btn').trigger('click')

    expect(JSON.parse(storage.read('posts'))).toHaveLength(1)

    // 卸载后重新挂载，模拟刷新页面
    wrapper.unmount()
    setActivePinia(createPinia())
    await mountApp()

    expect(homeFind(wrapper, 'post-text').text()).toBe('要持久化')
  })

  it('连续发布多条按时间倒序展示', async () => {
    await mountApp()

    await find(wrapper, 'composer-input').setValue('最早')
    await find(wrapper, 'publish-btn').trigger('click')
    vi.setSystemTime(NOW + 1000)

    await find(wrapper, 'composer-input').setValue('最新')
    await find(wrapper, 'publish-btn').trigger('click')

    const texts = homeFindAll(wrapper, 'post-text').map((el) => el.text())
    expect(texts).toEqual(['最新', '最早'])
  })

  it('输入框带 maxlength 属性，浏览器会限制录入长度', async () => {
    await mountApp()
    expect(find(wrapper, 'composer-input').attributes('maxlength')).toBe('280')
  })

  it('内容超过上限时无法发布（绕过 maxlength 也有兜底）', async () => {
    await mountApp()
    // 直接写入超长内容，模拟粘贴或 maxlength 失效
    await find(wrapper, 'composer-input').setValue('a'.repeat(300))

    expect(find(wrapper, 'char-counter').text()).toBe('300 / 280')
    expect(find(wrapper, 'publish-btn').attributes('disabled')).toBeDefined()
    expect(homeFindAll(wrapper, 'post-text')).toHaveLength(0)
  })

  it('个人资料昵称会同步到动态卡片', async () => {
    await mountApp()
    await find(wrapper, 'composer-input').setValue('作者名测试')
    await find(wrapper, 'publish-btn').trigger('click')

    await find(wrapper, 'tab-profile').trigger('click')
    await find(wrapper, 'edit-btn').trigger('click')
    await find(wrapper, 'name-input').setValue('阿铁')
    await find(wrapper, 'save-btn').trigger('click')

    await find(wrapper, 'tab-home').trigger('click')
    expect(homeFind(wrapper, 'post-author').text()).toBe('阿铁')
  })
})

describe('App · 详情与删除', () => {
  it('点击卡片进入详情页，显示完整信息', async () => {
    await mountApp()
    await find(wrapper, 'composer-input').setValue('详情测试')
    await find(wrapper, 'publish-btn').trigger('click')

    await homeFind(wrapper, 'open-btn').trigger('click')

    expect(find(wrapper, 'detail-text').text()).toBe('详情测试')
    expect(find(wrapper, 'detail-time').exists()).toBe(true)
    expect(find(wrapper, 'detail-chars').text()).toContain('4 字')
  })

  it('详情页返回后回到首页列表', async () => {
    await mountApp()
    await find(wrapper, 'composer-input').setValue('返回测试')
    await find(wrapper, 'publish-btn').trigger('click')
    await homeFind(wrapper, 'open-btn').trigger('click')

    const backBtn = wrapper.findAll('button').find((b) => b.text().includes('返回'))
    await backBtn.trigger('click')

    expect(find(wrapper, 'composer-input').exists()).toBe(true)
    expect(homeFind(wrapper, 'post-text').text()).toBe('返回测试')
  })

  it('从详情页删除后回到首页且列表为空', async () => {
    await mountApp()

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    await find(wrapper, 'composer-input').setValue('待删除')
    await find(wrapper, 'publish-btn').trigger('click')
    await homeFind(wrapper, 'open-btn').trigger('click')

    // 详情页里删除（此时首页不在 DOM，需用全局查询）
    await find(wrapper, 'delete-btn').trigger('click')

    expect(confirmSpy).toHaveBeenCalled()
    // 删除后详情自动关闭，回到首页且为空
    expect(find(wrapper, 'composer-input').exists()).toBe(true)
    expect(homeFind(wrapper, 'empty-state').exists()).toBe(true)
    expect(JSON.parse(storage.read('posts'))).toEqual([])
  })

  it('列表中删除单条后其他动态保留', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await mountApp()

    await find(wrapper, 'composer-input').setValue('会被删掉的')
    await find(wrapper, 'publish-btn').trigger('click')
    vi.setSystemTime(NOW + 1000)
    await find(wrapper, 'composer-input').setValue('保留的')
    await find(wrapper, 'publish-btn').trigger('click')

    // 删掉首页列表里的第一条（最新的「保留的」）
    await homeFindAll(wrapper, 'delete-btn')[0].trigger('click')

    expect(homeFindAll(wrapper, 'post-text')).toHaveLength(1)
    expect(homeFind(wrapper, 'post-text').text()).toBe('会被删掉的')
  })

  it('取消删除确认时数据不变', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    await mountApp()

    await find(wrapper, 'composer-input').setValue('不要删')
    await find(wrapper, 'publish-btn').trigger('click')
    await homeFind(wrapper, 'delete-btn').trigger('click')

    expect(homeFind(wrapper, 'post-text').text()).toBe('不要删')
  })
})

describe('App · 个人中心', () => {
  it('切换到个人中心显示资料与统计', async () => {
    await mountApp()
    await find(wrapper, 'composer-input').setValue('abc')
    await find(wrapper, 'publish-btn').trigger('click')
    await find(wrapper, 'composer-input').setValue('de')
    await find(wrapper, 'publish-btn').trigger('click')

    await find(wrapper, 'tab-profile').trigger('click')

    expect(find(wrapper, 'stat-posts').text()).toBe('2')
    expect(find(wrapper, 'stat-chars').text()).toBe('5')
    expect(find(wrapper, 'stat-days').text()).toBe('1')
  })

  it('我的动态只显示自己的动态并支持删除', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await mountApp()
    await find(wrapper, 'composer-input').setValue('我的动态')
    await find(wrapper, 'publish-btn').trigger('click')

    await find(wrapper, 'tab-profile').trigger('click')
    expect(find(wrapper, 'my-post-count').text()).toBe('1 条')

    await wrapper.find('[data-testid="my-timeline"]').find('[data-testid="delete-btn"]').trigger('click')
    expect(find(wrapper, 'my-empty').exists()).toBe(true)
    expect(find(wrapper, 'my-post-count').text()).toBe('0 条')
  })

  it('个人中心显示存储占用', async () => {
    await mountApp()
    await find(wrapper, 'composer-input').setValue('占点空间')
    await find(wrapper, 'publish-btn').trigger('click')
    await find(wrapper, 'tab-profile').trigger('click')

    expect(find(wrapper, 'storage-text').text()).toContain('占用')
  })

  it('存储进度条宽度必须是真实百分比（回归：曾因 ref 未解包退回满条）', async () => {
    await mountApp()
    await find(wrapper, 'composer-input').setValue('一点点内容')
    await find(wrapper, 'publish-btn').trigger('click')
    await find(wrapper, 'tab-profile').trigger('click')

    const style = find(wrapper, 'storage-fill').attributes('style')

    // 宽度应为百分比字面量，而不是 [object Object]
    expect(style).not.toContain('[object Object]')
    expect(style).toMatch(/width:\s*\d+(\.\d+)?%/)

    // 少量数据远未达到 5MB，宽度应是小值（至少 2%、远小于 100%）
    const width = Number.parseFloat(/width:\s*([\d.]+)%/.exec(style)?.[1] ?? '0')
    expect(width).toBeGreaterThanOrEqual(2)
    expect(width).toBeLessThan(10)
  })

  it('进度条 aria-valuenow 是数字而非对象', async () => {
    await mountApp()
    await find(wrapper, 'tab-profile').trigger('click')

    const value = find(wrapper, 'storage-bar').attributes('aria-valuenow')
    expect(Number.isNaN(Number(value))).toBe(false)
  })

  it('预警级别为普通时不应带上 warn/full 类', async () => {
    await mountApp()
    await find(wrapper, 'tab-profile').trigger('click')

    const classes = find(wrapper, 'storage-bar').classes()
    expect(classes).not.toContain('is-warn')
    expect(classes).not.toContain('is-full')
  })
})

describe('App · 存储降级提示', () => {
  it('存储正常时不显示告警条', async () => {
    await mountApp()
    expect(find(wrapper, 'storage-warning').exists()).toBe(false)
  })

  it('存储降级时显示告警条并可打开帮助面板', async () => {
    setStorage({ ...createStorage(), kind: 'session', available: false })
    await mountApp()

    expect(find(wrapper, 'storage-warning').exists()).toBe(true)
    expect(find(wrapper, 'storage-warning-text').text()).toContain('刷新不丢')

    await find(wrapper, 'help-btn').trigger('click')
    expect(find(wrapper, 'help-dialog').exists()).toBe(true)
  })

  it('帮助面板可关闭', async () => {
    setStorage({ ...createStorage(), kind: 'memory', available: false })
    await mountApp()

    await find(wrapper, 'help-btn').trigger('click')
    await find(wrapper, 'help-close-btn').trigger('click')

    expect(find(wrapper, 'help-dialog').exists()).toBe(false)
  })

  it('降级状态下依然可以发布与查看（最重要的底线）', async () => {
    setStorage({ ...createStorage(), kind: 'memory', available: false })
    await mountApp()

    await find(wrapper, 'composer-input').setValue('降级也要能发')
    await find(wrapper, 'publish-btn').trigger('click')

    expect(homeFind(wrapper, 'post-text').text()).toBe('降级也要能发')
  })
})

describe('App · 天气卡片', () => {
  it('展示所在地、温度与天气', async () => {
    await mountApp()
    await flush()
    await wrapper.vm.$nextTick()

    expect(find(wrapper, 'weather-location').text()).toContain('长沙市')
    expect(find(wrapper, 'weather-temp').text()).toBe('14°')
  })

  it('点击刷新触发再次加载', async () => {
    await mountApp()
    await find(wrapper, 'refresh-btn').trigger('click')
    await flush()
    expect(find(wrapper, 'refresh-btn').exists()).toBe(true)
  })
})

describe('App · 数据备份', () => {
  it('导出后提示条给出反馈', async () => {
    // 只替换静态方法，保留 URL 构造器本身（happy-dom 内部仍会 new URL）
    const originalCreate = URL.createObjectURL
    const originalRevoke = URL.revokeObjectURL
    URL.createObjectURL = vi.fn(() => 'blob:mock')
    URL.revokeObjectURL = vi.fn()

    try {
      await mountApp()

      await find(wrapper, 'composer-input').setValue('要备份的')
      await find(wrapper, 'publish-btn').trigger('click')
      await find(wrapper, 'tab-profile').trigger('click')
      await find(wrapper, 'export-btn').trigger('click')

      expect(find(wrapper, 'toast').text()).toContain('已导出')
    } finally {
      URL.createObjectURL = originalCreate
      URL.revokeObjectURL = originalRevoke
    }
  })

  it('导入非法文件时给出失败提示且数据不变', async () => {
    await mountApp()
    await find(wrapper, 'composer-input').setValue('原有数据')
    await find(wrapper, 'publish-btn').trigger('click')
    await find(wrapper, 'tab-profile').trigger('click')

    const file = new File(['这不是 JSON{{'], 'bad.json', { type: 'application/json' })
    const input = find(wrapper, 'import-file')
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')

    // FileReader 是异步回调，等待提示真正出现再断言
    await vi.waitFor(() => {
      expect(find(wrapper, 'toast').text()).toContain('失败')
    })

    await find(wrapper, 'tab-home').trigger('click')
    expect(homeFind(wrapper, 'post-text').text()).toBe('原有数据')
  })

  it('清空数据后动态与资料一起归零', async () => {
    await mountApp()
    await find(wrapper, 'composer-input').setValue('要被清掉的')
    await find(wrapper, 'publish-btn').trigger('click')
    await find(wrapper, 'tab-profile').trigger('click')

    await find(wrapper, 'clear-btn').trigger('click')
    await find(wrapper, 'clear-confirm-btn').trigger('click')

    expect(find(wrapper, 'stat-posts').text()).toBe('0')
    expect(find(wrapper, 'stat-days').text()).toBe('1')

    await find(wrapper, 'tab-home').trigger('click')
    expect(homeFind(wrapper, 'empty-state').exists()).toBe(true)
  })
})

describe('App · 视图切换', () => {
  it('两个标签页之间可以来回切换', async () => {
    await mountApp()

    await find(wrapper, 'tab-profile').trigger('click')
    expect(find(wrapper, 'profile-name').exists()).toBe(true)

    await find(wrapper, 'tab-home').trigger('click')
    expect(find(wrapper, 'composer-input').exists()).toBe(true)
  })

  it('Esc 可在详情页返回首页', async () => {
    await mountApp()
    await find(wrapper, 'composer-input').setValue('esc 测试')
    await find(wrapper, 'publish-btn').trigger('click')
    await homeFind(wrapper, 'open-btn').trigger('click')

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()

    expect(find(wrapper, 'composer-input').exists()).toBe(true)
  })
})

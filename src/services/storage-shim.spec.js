/**
 * 存储垫片测试（TDD 回归）
 *
 * 复现并锁死一个真实 bug：
 * 浏览器拒绝站点数据时，`window.localStorage` 的访问器本身会抛异常。
 * Pinia 内置的 devtools 代码用 `typeof localStorage === 'undefined'` 做守卫，
 * 结果守卫自身就抛错 → Pinia 模块求值失败 → Vue 应用无法挂载 → 页面白屏。
 *
 * 垫片的职责：把会抛异常的存储换成可安全访问的内存替身，
 * 让第三方库不再崩，同时让应用自身的存储层识别出「这不是真存储」并如实降级。
 */
import { describe, it, expect, afterEach } from 'vitest'
import { installStorageShim, isShim, SHIM_MARK, getStorageCapability } from './storage-shim'
import { createStorage } from './storage'

const patched = []

/** 制造「访问即抛错」的存储属性，模拟浏览器策略拦截 */
function blockProperty(name) {
  const descriptor = Object.getOwnPropertyDescriptor(window, name)
  patched.push({ name, descriptor })
  Object.defineProperty(window, name, {
    configurable: true,
    get() {
      throw new Error(`${name} is blocked`)
    }
  })
}

function blockSetter(name) {
  const descriptor = Object.getOwnPropertyDescriptor(window, name)
  patched.push({ name, descriptor })
  Object.defineProperty(window, name, {
    configurable: true,
    get: () => '',
    set() {
      throw new Error(`${name} is blocked`)
    }
  })
}

afterEach(() => {
  while (patched.length) {
    const { name, descriptor } = patched.pop()
    if (descriptor) Object.defineProperty(window, name, descriptor)
    else delete window[name]
  }
})

describe('storage-shim · 危险的 typeof 守卫', () => {
  it('正常情况下 typeof 可以安全求值', () => {
    installStorageShim()
    expect(() => typeof window.localStorage).not.toThrow()
  })

  it('未安装垫片时，typeof 会抛错（这正是白屏的根因）', () => {
    blockProperty('localStorage')
    // 重现第三方库守卫失败：typeof 本身就抛
    expect(() => typeof window.localStorage).toThrow()
  })

  it('安装垫片后 typeof 不再抛错', () => {
    blockProperty('localStorage')
    installStorageShim()

    expect(() => typeof window.localStorage).not.toThrow()
    expect(typeof window.localStorage).toBe('object')
  })

  it('安装垫片后，第三方库能做完整的读写了', () => {
    blockProperty('localStorage')
    blockProperty('sessionStorage')
    installStorageShim()

    // 模拟 Pinia devtools 的初始化写法
    expect(() => {
      if (typeof localStorage === 'undefined' || localStorage === null) return null
      return typeof localStorage.getItem !== 'undefined'
        ? localStorage.getItem('__VUE_DEVTOOLS_KIT_TIMELINE_LAYERS_STATE__')
        : null
    }).not.toThrow()

    // 写入也不应抛错
    expect(() => {
      localStorage.setItem('k', 'v')
      expect(localStorage.getItem('k')).toBe('v')
      localStorage.removeItem('k')
    }).not.toThrow()
  })

  it('垫片实现具备 Storage 的基本接口', () => {
    blockProperty('localStorage')
    installStorageShim()

    const area = window.localStorage
    area.clear()
    area.setItem('a', '1')
    area.setItem('b', '2')

    expect(area.length).toBe(2)
    expect(area.key(0)).toBe('a')
    expect(area.getItem('a')).toBe('1')
    expect(['a', 'b']).toContain(area.key(1))

    area.removeItem('a')
    expect(area.getItem('a')).toBeNull()
    area.clear()
    expect(area.length).toBe(0)
  })

  it('setItem 会把值转成字符串（与原生行为一致）', () => {
    blockProperty('localStorage')
    installStorageShim()

    window.localStorage.setItem('n', 123)
    expect(window.localStorage.getItem('n')).toBe('123')
  })

  it('替身带有标记，便于应用识别它不是真实存储', () => {
    blockProperty('localStorage')
    installStorageShim()

    expect(isShim(window.localStorage)).toBe(true)
    expect(window.localStorage[SHIM_MARK]).toBe(true)
  })

  it('原生存储可用时不安装替身，也不影响其行为', () => {
    installStorageShim()

    expect(isShim(window.localStorage)).toBe(false)
    window.localStorage.setItem('real', 'yes')
    expect(window.localStorage.getItem('real')).toBe('yes')
    window.localStorage.removeItem('real')
  })

  it('可重复安装而不破坏已装替身', () => {
    blockProperty('localStorage')
    installStorageShim()
    window.localStorage.setItem('keep', 'me')

    installStorageShim()
    // 重复安装后数据仍在，说明没有把替身换成新的空实例
    expect(window.localStorage.getItem('keep')).toBe('me')
  })

  it('替换存储属性失败时不抛错（环境极端受限）', () => {
    // 模拟「可读但替换会被拒」：defineProperty 抛 TypeError
    const originalDefine = Object.defineProperty
    Object.defineProperty = function (target, prop, descriptor) {
      if (target === window && (prop === 'localStorage' || prop === 'sessionStorage')) {
        throw new TypeError('Cannot redefine property')
      }
      return originalDefine.call(Object, target, prop, descriptor)
    }

    try {
      expect(() => installStorageShim()).not.toThrow()
    } finally {
      Object.defineProperty = originalDefine
    }
  })

  it('即使替身安装失败，能力探测也会报告原生不可用', () => {
    blockProperty('sessionStorage')

    const capability = installStorageShim()
    expect(capability.session).toBe(false)
  })

  it('能力探测如实反映原生存储是否可用', () => {
    const capability = installStorageShim()
    expect(capability.local).toBe(true)
    expect(capability.session).toBe(true)
  })

  it('原生被禁时能力探测报告不可用', () => {
    blockProperty('localStorage')
    const capability = installStorageShim()
    expect(capability.local).toBe(false)
  })

  it('getStorageCapability 返回可用性快照', () => {
    const capability = getStorageCapability()
    expect(capability).toHaveProperty('local')
    expect(capability).toHaveProperty('session')
  })
})

describe('storage-shim 与存储层协作', () => {
  it('原生不可用时，存储层不把替身当成持久化存储', () => {
    blockProperty('localStorage')
    blockProperty('sessionStorage')
    blockSetter('name') // window.name 也写不了 → 落到 memory

    installStorageShim()
    const store = createStorage()

    // 关键：不能因为垫片可写就误判为 local
    expect(store.kind).not.toBe('local')
    expect(store.available).toBe(false)
  })

  it('原生不可用时，存储层仍能正常读写（不抛错）', () => {
    blockProperty('localStorage')
    blockProperty('sessionStorage')
    blockSetter('name')

    installStorageShim()
    const store = createStorage()

    expect(() => store.write('posts', '[]')).not.toThrow()
    expect(store.read('posts')).toBe('[]')
  })

  it('只有 localStorage 被禁时，存储层退到 sessionStorage（原生）并标记不可持久化', () => {
    blockProperty('localStorage')
    installStorageShim()

    const store = createStorage()
    expect(store.kind).toBe('session')
    expect(store.available).toBe(false)

    store.write('posts', '[1]')
    expect(window.sessionStorage.getItem('minifeed.posts')).toBe('[1]')
  })

  it('存储正常时不受垫片影响', () => {
    installStorageShim()
    const store = createStorage()

    expect(store.kind).toBe('local')
    expect(store.available).toBe(true)

    store.write('posts', '[2]')
    expect(window.localStorage.getItem('minifeed.posts')).toBe('[2]')
    store.remove('posts')
  })
})

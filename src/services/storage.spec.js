/**
 * 存储层测试（TDD）
 *
 * 目标契约：
 *   createStorage() 返回 { kind, read(key), write(key, value), remove(key), keys(), usage(), available }
 *   - kind 取值：'local' | 'session' | 'tab' | 'memory'
 *   - 按 localStorage → sessionStorage → window.name → 内存 依次降级
 *   - 任何一步抛异常都不能冒泡，写入必须准备好在内存兜底
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createStorage, PREFIX, NAME_MARK } from './storage'

/** 本用例内被改写过的 window 属性，用例结束后统一还原，避免污染其他用例 */
const patched = []

/** 让某个 window 属性在访问时直接抛错，模拟浏览器禁用站点数据 */
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

/** 让某个 window 属性可读但不可写，模拟标签页容器被拒 */
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

/** 用一个可控的假 Storage 替换 window 属性，用于模拟运行中读写失败 */
function patchStorage(name, fake) {
  const descriptor = Object.getOwnPropertyDescriptor(window, name)
  patched.push({ name, descriptor })
  Object.defineProperty(window, name, { configurable: true, writable: true, value: fake })
}

/**
 * 造一个行为可控的 Storage。
 * failing 为 null 时一切正常；置为 'read' | 'write' | 'remove' 后对应操作抛错，
 * 用来复现「创建时可用、运行中被回收 / 配额写满」的场景。
 */
function fakeStorage() {
  const map = new Map()
  return {
    failing: null,
    get length() {
      return map.size
    },
    key: (index) => Array.from(map.keys())[index] ?? null,
    getItem(key) {
      if (this.failing === 'read') throw new Error('read is blocked')
      return map.has(key) ? map.get(key) : null
    },
    setItem(key, value) {
      if (this.failing === 'write') throw new Error('quota exceeded')
      map.set(key, String(value))
    },
    removeItem(key) {
      if (this.failing === 'remove') throw new Error('remove is blocked')
      map.delete(key)
    }
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  while (patched.length) {
    const { name, descriptor } = patched.pop()
    if (descriptor) Object.defineProperty(window, name, descriptor)
    else delete window[name]
  }
})

describe('storage · 降级判定', () => {
  it('localStorage 可用时使用 localStorage', () => {
    const store = createStorage()
    expect(store.kind).toBe('local')
    expect(store.available).toBe(true)
  })

  it('localStorage 被禁时退到 sessionStorage', () => {
    blockProperty('localStorage')

    const store = createStorage()
    expect(store.kind).toBe('session')
    expect(store.available).toBe(false)

    store.write('a', '1')
    expect(window.sessionStorage.getItem(PREFIX + 'a')).toBe('1')
  })

  it('两个 Storage 都被禁时退到 window.name', () => {
    blockProperty('localStorage')
    blockProperty('sessionStorage')

    const store = createStorage()
    expect(store.kind).toBe('tab')

    store.write('a', '1')
    expect(window.name.startsWith(NAME_MARK)).toBe(true)
  })

  it('window.name 也写入失败时退到内存模式', () => {
    blockProperty('localStorage')
    blockProperty('sessionStorage')
    blockSetter('name')

    const store = createStorage()
    expect(store.kind).toBe('memory')

    // 内存模式下依然能读写，不抛错
    expect(() => store.write('a', '1')).not.toThrow()
    expect(store.read('a')).toBe('1')
  })
})

describe('storage · window.name 往返', () => {
  it('写入后重新创建实例仍能读回（模拟刷新页面）', () => {
    blockProperty('localStorage')
    blockProperty('sessionStorage')

    const first = createStorage()
    first.write('posts', JSON.stringify([{ id: '1' }]))

    // 刷新 = 重新执行一次 createStorage，此时 window.name 已有上次的数据
    const second = createStorage()
    expect(second.kind).toBe('tab')
    expect(JSON.parse(second.read('posts'))).toEqual([{ id: '1' }])
  })

  it('window.name 里不是自己的数据时视为空，不污染', () => {
    blockProperty('localStorage')
    blockProperty('sessionStorage')
    window.name = 'some other page data'

    const store = createStorage()
    expect(store.read('posts')).toBeNull()
  })
})

describe('storage · 基础读写', () => {
  let store

  beforeEach(() => {
    store = createStorage()
  })

  it('写入后可读回，未写入返回 null', () => {
    store.write('posts', 'hello')
    expect(store.read('posts')).toBe('hello')
    expect(store.read('missing')).toBeNull()
  })

  it('remove 后读到 null', () => {
    store.write('posts', 'hello')
    store.remove('posts')
    expect(store.read('posts')).toBeNull()
  })

  it('键名自动加前缀，避免与其他应用冲突', () => {
    store.write('posts', 'hello')
    expect(window.localStorage.getItem(PREFIX + 'posts')).toBe('hello')
    expect(window.localStorage.getItem('posts')).toBeNull()
  })

  it('只列出自己前缀下的键，返回去前缀后的名字', () => {
    window.localStorage.setItem('foreign.key', 'x')
    store.write('posts', '1')
    store.write('profile', '2')
    expect(store.keys().sort()).toEqual(['posts', 'profile'])
  })
})

describe('storage · 容错', () => {
  it('读取过程中存储突然不可用，回落为 null 而不抛错', () => {
    const fake = fakeStorage()
    patchStorage('localStorage', fake)

    const store = createStorage()
    store.write('posts', 'hello')
    expect(store.read('posts')).toBe('hello')

    fake.failing = 'read'
    expect(() => store.read('posts')).not.toThrow()
    expect(store.read('posts')).toBeNull()
  })

  it('写入过程中存储突然不可用，写入不抛错且值仍可读（内存兜底）', () => {
    const fake = fakeStorage()
    patchStorage('localStorage', fake)

    const store = createStorage()
    fake.failing = 'write'

    expect(() => store.write('posts', 'hello')).not.toThrow()
    expect(store.read('posts')).toBe('hello')
  })

  it('写入失败后仍能 remove，不抛错', () => {
    const fake = fakeStorage()
    patchStorage('localStorage', fake)

    const store = createStorage()
    fake.failing = 'write'
    store.write('posts', 'hello')

    fake.failing = 'remove'
    expect(() => store.remove('posts')).not.toThrow()
    // remove 之后语义上必须读不到
    fake.failing = null
    expect(store.read('posts')).toBeNull()
  })
})

describe('storage · 用量统计', () => {
  it('按 UTF-16 计算自身键的字节数', () => {
    const store = createStorage()
    expect(store.usage()).toBe(0)

    store.write('a', '12')
    // key: PREFIX+'a' 长度 * 2 ； value '12' 长度 2 * 2
    const expected = (PREFIX + 'a').length * 2 + 2 * 2
    expect(store.usage()).toBe(expected)
  })

  it('不统计其他应用的键', () => {
    const store = createStorage()
    window.localStorage.setItem('someone.else', 'x'.repeat(100))
    expect(store.usage()).toBe(0)
  })

  it('内存模式下用量为 0', () => {
    blockProperty('localStorage')
    blockProperty('sessionStorage')
    blockSetter('name')

    const store = createStorage()
    store.write('a', '1')
    expect(store.usage()).toBe(0)
  })
})

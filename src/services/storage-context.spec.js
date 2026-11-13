/**
 * storage-context 测试（TDD 补齐）
 *
 * 这是 store 与存储实现之间的接缝：store 通过它取实例，
 * 测试通过 setStorage 替换实例，从而不必 mock 全局 window.localStorage。
 */
import { describe, it, expect, afterEach } from 'vitest'
import { useStorage, setStorage } from './storage-context'
import { createStorage } from './storage'

afterEach(() => {
  setStorage(null)
})

describe('storage-context', () => {
  it('首次调用会惰性创建一个可用实例', () => {
    const storage = useStorage()
    expect(storage).toBeTruthy()
    expect(typeof storage.read).toBe('function')
    expect(typeof storage.write).toBe('function')
    expect(['local', 'session', 'tab', 'memory']).toContain(storage.kind)
  })

  it('多次调用返回同一个实例（应用级单例）', () => {
    expect(useStorage()).toBe(useStorage())
  })

  it('setStorage 可替换实例', () => {
    const custom = createStorage()
    setStorage(custom)
    expect(useStorage()).toBe(custom)
  })

  it('传入 null 后重置为默认行为（下次调用重新创建）', () => {
    const custom = createStorage()
    setStorage(custom)
    expect(useStorage()).toBe(custom)

    setStorage(null)
    expect(useStorage()).not.toBe(custom)
  })

  it('替换后读写反映在替换的实例上', () => {
    const custom = createStorage()
    setStorage(custom)

    useStorage().write('posts', '[]')
    expect(custom.read('posts')).toBe('[]')
  })
})

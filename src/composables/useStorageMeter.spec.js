/**
 * 存储占用计量 composable 测试（TDD）
 *
 * 存储用量会随每次增删变化，所以这里验证的是：
 * 显式 refresh 能拿到最新值，且能按阈值给出预警级别。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { useStorageMeter } from './useStorageMeter'
import { createStorage } from '@/services/storage'
import { setStorage } from '@/services/storage-context'

const QUOTA = 5 * 1024 * 1024

function withSetup(composable) {
  let result
  const wrapper = mount(
    defineComponent({
      setup() {
        result = composable()
        return () => h('div')
      }
    })
  )
  return { result, wrapper }
}

beforeEach(() => {
  setStorage(null)
})

afterEach(() => {
  setStorage(null)
})

describe('useStorageMeter', () => {
  it('初始用量为 0，百分比为 0', () => {
    setStorage(createStorage())
    const { result, wrapper } = withSetup(() => useStorageMeter())
    expect(result.usedBytes.value).toBe(0)
    expect(result.percent.value).toBe(0)
    wrapper.unmount()
  })

  it('refresh 后读到写入的数据量', () => {
    const storage = createStorage()
    setStorage(storage)
    const { result, wrapper } = withSetup(() => useStorageMeter())

    storage.write('posts', 'x'.repeat(100))
    result.refresh()

    expect(result.usedBytes.value).toBeGreaterThan(0)
    expect(result.formatted.value).not.toBe('0 B')
    wrapper.unmount()
  })

  it('占用低于 70% 时为 normal 级别', () => {
    const storage = createStorage()
    setStorage(storage)
    storage.write('posts', 'x'.repeat(100))

    const { result, wrapper } = withSetup(() => useStorageMeter())
    expect(result.level.value).toBe('normal')
    wrapper.unmount()
  })

  it('达到 70% 阈值时为 warn 级别', () => {
    const { result, wrapper } = withSetup(() =>
      useStorageMeter({ usedBytesOverride: QUOTA * 0.75 })
    )
    expect(result.level.value).toBe('warn')
    wrapper.unmount()
  })

  it('达到 90% 阈值时为 danger 级别', () => {
    const { result, wrapper } = withSetup(() =>
      useStorageMeter({ usedBytesOverride: QUOTA * 0.95 })
    )
    expect(result.level.value).toBe('danger')
    wrapper.unmount()
  })

  it('进度条宽度上限为 100%（不会溢出）', () => {
    const { result, wrapper } = withSetup(() =>
      useStorageMeter({ usedBytesOverride: QUOTA * 2 })
    )
    expect(result.percent.value).toBe(100)
    expect(result.barWidth.value).toBe('100%')
    wrapper.unmount()
  })

  it('有占用时进度条至少有 2% 宽度，保证肉眼可见', () => {
    setStorage(createStorage())
    const { result, wrapper } = withSetup(() =>
      useStorageMeter({ usedBytesOverride: 10 })
    )
    expect(result.barWidth.value).toBe('2%')
    wrapper.unmount()
  })

  it('无占用时进度条宽度为 0', () => {
    setStorage(createStorage())
    const { result, wrapper } = withSetup(() => useStorageMeter())
    expect(result.barWidth.value).toBe('0%')
    wrapper.unmount()
  })

  it('存储不可用时给出内存模式说明', () => {
    const storage = createStorage()
    // 模拟降级实例：kind 非 local
    const degraded = { ...storage, kind: 'session', available: false }
    setStorage(degraded)

    const { result, wrapper } = withSetup(() => useStorageMeter())
    expect(result.isPersistent.value).toBe(false)
    expect(result.label.value).toContain('标签页')
    wrapper.unmount()
  })

  it('存储可用时标签为占用情况', () => {
    setStorage(createStorage())
    const { result, wrapper } = withSetup(() => useStorageMeter())
    expect(result.isPersistent.value).toBe(true)
    expect(result.label.value).toContain('占用')
    wrapper.unmount()
  })

  it('接近上限时标签给出提示', () => {
    const { result, wrapper } = withSetup(() =>
      useStorageMeter({ usedBytesOverride: QUOTA * 0.95 })
    )
    expect(result.label.value).toContain('接近上限')
    wrapper.unmount()
  })
})

/**
 * 实时时钟 composable 测试（TDD）
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { useClock } from './useClock'
import { formatClock } from '@/utils/time'

const NOW = new Date(2026, 10, 13, 10, 0, 0).getTime()

/** 用最小宿主组件挂载 composable，以触发 onMounted / onUnmounted */
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
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useClock', () => {
  it('初始值即为当前时间文本', () => {
    const { result, wrapper } = withSetup(() => useClock())
    expect(result.now.value).toBe(NOW)
    expect(result.formatted.value).toBe(formatClock(NOW))
    wrapper.unmount()
  })

  it('每秒自动更新', async () => {
    const { result, wrapper } = withSetup(() => useClock())

    vi.advanceTimersByTime(1000)
    await nextTick()
    expect(result.now.value).toBe(NOW + 1000)

    vi.advanceTimersByTime(2000)
    await nextTick()
    expect(result.now.value).toBe(NOW + 3000)
    wrapper.unmount()
  })

  it('组件卸载后停止计时，避免内存泄漏', async () => {
    const { result, wrapper } = withSetup(() => useClock())
    const before = result.now.value

    wrapper.unmount()
    vi.advanceTimersByTime(5000)
    await nextTick()

    expect(result.now.value).toBe(before)
  })

  it('可传入自定义刷新间隔', async () => {
    const { result, wrapper } = withSetup(() => useClock({ interval: 500 }))

    vi.advanceTimersByTime(500)
    await nextTick()
    expect(result.now.value).toBe(NOW + 500)
    wrapper.unmount()
  })
})

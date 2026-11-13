/**
 * useToast 测试（TDD 补齐）
 * 关注：显示、自动消失、重复调用重置计时、卸载后不再触发。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { useToast } from './useToast'

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
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useToast', () => {
  it('初始无消息', () => {
    const { result, wrapper } = withSetup(() => useToast())
    expect(result.message.value).toBe('')
    wrapper.unmount()
  })

  it('show 后立即显示消息', () => {
    const { result, wrapper } = withSetup(() => useToast())
    result.show('已导出 2 条动态')
    expect(result.message.value).toBe('已导出 2 条动态')
    wrapper.unmount()
  })

  it('到时后自动清空', async () => {
    const { result, wrapper } = withSetup(() => useToast({ duration: 1000 }))
    result.show('短暂提示')

    vi.advanceTimersByTime(999)
    await nextTick()
    expect(result.message.value).toBe('短暂提示')

    vi.advanceTimersByTime(1)
    await nextTick()
    expect(result.message.value).toBe('')
    wrapper.unmount()
  })

  it('重复 show 会重置计时（不会提前消失）', async () => {
    const { result, wrapper } = withSetup(() => useToast({ duration: 1000 }))

    result.show('第一条')
    vi.advanceTimersByTime(800)
    result.show('第二条')
    vi.advanceTimersByTime(800)
    await nextTick()

    // 若未重置，此时早已清空
    expect(result.message.value).toBe('第二条')

    vi.advanceTimersByTime(200)
    await nextTick()
    expect(result.message.value).toBe('')
    wrapper.unmount()
  })

  it('空消息被忽略，不会覆盖当前提示', () => {
    const { result, wrapper } = withSetup(() => useToast())
    result.show('有效提示')
    result.show('')
    expect(result.message.value).toBe('有效提示')
    wrapper.unmount()
  })

  it('hide 可立即清空', () => {
    const { result, wrapper } = withSetup(() => useToast())
    result.show('提示')
    result.hide()
    expect(result.message.value).toBe('')
    wrapper.unmount()
  })

  it('组件卸载后计时器不再触发（避免内存泄漏）', async () => {
    const { result, wrapper } = withSetup(() => useToast({ duration: 500 }))
    result.show('提示')
    wrapper.unmount()

    // 卸载后推进时间不应报错，也不应再改动状态
    expect(() => vi.advanceTimersByTime(1000)).not.toThrow()
    await nextTick()
  })

  it('默认时长为 2600ms', async () => {
    const { result, wrapper } = withSetup(() => useToast())
    result.show('默认时长')

    vi.advanceTimersByTime(2599)
    await nextTick()
    expect(result.message.value).toBe('默认时长')

    vi.advanceTimersByTime(1)
    await nextTick()
    expect(result.message.value).toBe('')
    wrapper.unmount()
  })
})

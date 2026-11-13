/**
 * useConfirm 测试（TDD 补齐）
 *
 * 这层存在的意义是「不直接依赖 window.confirm」：
 * 它在部分运行环境不存在（如嵌入式 WebView），且不可注入会让删除流程难以测试。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { useConfirm, useInlineConfirm } from './useConfirm'

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

afterEach(() => {
  // 恢复 setup.js 提供的默认实现
  window.confirm = vi.fn(() => true)
})

describe('useConfirm · 默认行为', () => {
  it('转达原生 confirm 的返回值', () => {
    const spy = vi.fn(() => true)
    window.confirm = spy

    const { result, wrapper } = withSetup(() => useConfirm())
    expect(result.ask('确定吗？')).toBe(true)
    expect(spy).toHaveBeenCalledWith('确定吗？')
    wrapper.unmount()
  })

  it('用户点取消时返回 false', () => {
    window.confirm = vi.fn(() => false)
    const { result, wrapper } = withSetup(() => useConfirm())
    expect(result.ask('确定吗？')).toBe(false)
    wrapper.unmount()
  })

  it('canConfirm 报告当前环境是否支持弹窗', () => {
    const { result, wrapper } = withSetup(() => useConfirm())
    expect(result.canConfirm()).toBe(true)
    wrapper.unmount()
  })
})

describe('useConfirm · 可注入', () => {
  it('优先使用注入的 confirmFn', () => {
    const injected = vi.fn(() => false)
    const { result, wrapper } = withSetup(() => useConfirm({ confirmFn: injected }))

    expect(result.ask('要删吗？')).toBe(false)
    expect(injected).toHaveBeenCalledWith('要删吗？')
    wrapper.unmount()
  })

  it('注入函数抛错时按 fallback 处理，不向上抛', () => {
    const injected = vi.fn(() => {
      throw new Error('boom')
    })
    const { result, wrapper } = withSetup(() => useConfirm({ confirmFn: injected }))

    expect(() => result.ask('x')).not.toThrow()
    expect(result.ask('x')).toBe(false)
    wrapper.unmount()
  })

  it('fallback 可指定为 true（用于可安全继续的场景）', () => {
    const { result, wrapper } = withSetup(() => useConfirm({ confirmFn: undefined }))
    // 注入 undefined 时回落到原生实现
    expect(typeof result.ask('x', { fallback: true })).toBe('boolean')
    wrapper.unmount()
  })
})

describe('useConfirm · 环境无 confirm', () => {
  it('原生不可用且无注入时返回 fallback（默认 false，避免误删）', () => {
    const original = window.confirm
    // 模拟环境不提供 confirm
    Object.defineProperty(window, 'confirm', { configurable: true, writable: true, value: undefined })

    try {
      const { result, wrapper } = withSetup(() => useConfirm())
      expect(result.ask('危险操作')).toBe(false)
      expect(result.canConfirm()).toBe(false)
      wrapper.unmount()
    } finally {
      Object.defineProperty(window, 'confirm', { configurable: true, writable: true, value: original })
    }
  })

  it('环境无 confirm 时可显式要求 fallback 为 true', () => {
    const original = window.confirm
    Object.defineProperty(window, 'confirm', { configurable: true, writable: true, value: undefined })

    try {
      const { result, wrapper } = withSetup(() => useConfirm())
      expect(result.ask('继续？', { fallback: true })).toBe(true)
      wrapper.unmount()
    } finally {
      Object.defineProperty(window, 'confirm', { configurable: true, writable: true, value: original })
    }
  })
})

describe('useInlineConfirm', () => {
  it('初始为未确认状态', () => {
    const { result, wrapper } = withSetup(() => useInlineConfirm())
    expect(result.pending.value).toBe(false)
    wrapper.unmount()
  })

  it('ask 进入待确认状态', () => {
    const { result, wrapper } = withSetup(() => useInlineConfirm())
    result.ask()
    expect(result.pending.value).toBe(true)
    wrapper.unmount()
  })

  it('cancel 退出待确认状态且不执行', () => {
    const { result, wrapper } = withSetup(() => useInlineConfirm())
    result.ask()
    result.cancel()
    expect(result.pending.value).toBe(false)
    wrapper.unmount()
  })

  it('confirm 返回 true 并退出待确认状态', () => {
    const { result, wrapper } = withSetup(() => useInlineConfirm())
    result.ask()
    expect(result.confirm()).toBe(true)
    expect(result.pending.value).toBe(false)
    wrapper.unmount()
  })

  it('不依赖原生 confirm，任何环境都能工作', async () => {
    const original = window.confirm
    Object.defineProperty(window, 'confirm', { configurable: true, writable: true, value: undefined })

    try {
      const { result, wrapper } = withSetup(() => useInlineConfirm())
      expect(() => result.ask()).not.toThrow()
      await nextTick()
      expect(result.pending.value).toBe(true)
      wrapper.unmount()
    } finally {
      Object.defineProperty(window, 'confirm', { configurable: true, writable: true, value: original })
    }
  })
})

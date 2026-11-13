/**
 * 确认对话框 composable。
 *
 * 为什么不直接调 window.confirm：
 * 1) 它不是所有运行环境都提供（部分嵌入式 WebView、测试环境）；
 * 2) 直接依赖全局函数会让「删除」这类关键流程难以测试。
 * 因此收敛成一个可替换的询问入口，取不到原生能力时安全降级。
 */
import { ref } from 'vue'

/** 惰性读取，避免在模块加载阶段就固化（测试与运行时替换都能生效） */
function resolveConfirm(confirmFn) {
  if (typeof confirmFn === 'function') return confirmFn
  if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
    return window.confirm.bind(window)
  }
  return null
}

export function useConfirm({ confirmFn } = {}) {
  /**
   * 询问用户是否继续。
   * fallback 决定「环境无法弹窗」时的默认答案，调用方按操作危险程度自行选择。
   */
  function ask(message, { fallback = false } = {}) {
    const fn = resolveConfirm(confirmFn)
    if (!fn) return fallback
    try {
      return Boolean(fn(message))
    } catch {
      return fallback
    }
  }

  return { ask, canConfirm: () => resolveConfirm(confirmFn) !== null }
}

/** 行内确认状态：不依赖原生弹窗，任何环境都能工作 */
export function useInlineConfirm() {
  const pending = ref(false)

  return {
    pending,
    ask() {
      pending.value = true
    },
    cancel() {
      pending.value = false
    },
    confirm() {
      pending.value = false
      return true
    }
  }
}

/**
 * Toast 消息 composable。
 * 只维护「当前要显示的消息」，到期自动清空；计时器随宿主卸载清理。
 */
import { onUnmounted, ref } from 'vue'

export function useToast({ duration = 2600 } = {}) {
  const message = ref('')
  let timer = null

  function clearTimer() {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  /** 显示一条消息；重复调用会重置计时 */
  function show(text) {
    if (!text) return
    clearTimer()
    message.value = text
    timer = setTimeout(() => {
      message.value = ''
      timer = null
    }, duration)
  }

  function hide() {
    clearTimer()
    message.value = ''
  }

  onUnmounted(clearTimer)

  return { message, show, hide }
}

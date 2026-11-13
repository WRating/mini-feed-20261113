/**
 * 实时时钟：每秒钟推进一次的当前时间。
 * 计时器随宿主组件卸载自动清理，避免离开页面后仍在跑。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { formatClock } from '@/utils/time'

export function useClock({ interval = 1000 } = {}) {
  const now = ref(Date.now())
  let timer = null

  onMounted(() => {
    timer = setInterval(() => {
      now.value = Date.now()
    }, interval)
  })

  onUnmounted(() => {
    if (timer !== null) {
      clearInterval(timer)
      timer = null
    }
  })

  return {
    now,
    formatted: computed(() => formatClock(now.value))
  }
}

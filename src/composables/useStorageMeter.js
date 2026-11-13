/**
 * 本地存储占用计量。
 * 用量需要显式 refresh（写操作后调用），避免在计算属性里反复遍历存储。
 */
import { computed, ref } from 'vue'
import { useStorage } from '@/services/storage-context'
import { formatBytes } from '@/utils/bytes'

/** 浏览器 Local Storage 的常见配额，仅用于估算占比 */
export const QUOTA_BYTES = 5 * 1024 * 1024

const WARN_RATIO = 0.7
const DANGER_RATIO = 0.9

export function useStorageMeter({ usedBytesOverride } = {}) {
  const storage = useStorage()
  const measured = ref(usedBytesOverride ?? storage.usage())

  const usedBytes = computed(() => measured.value)
  const percent = computed(() =>
    Math.min(100, (usedBytes.value / QUOTA_BYTES) * 100)
  )
  const formatted = computed(() => formatBytes(usedBytes.value))
  const isPersistent = computed(() => storage.available)

  /** 阈值级别，供 UI 换色 */
  const level = computed(() => {
    if (percent.value >= DANGER_RATIO * 100) return 'danger'
    if (percent.value >= WARN_RATIO * 100) return 'warn'
    return 'normal'
  })

  /** 进度条宽度：有占用时至少 2%，保证肉眼可见 */
  const barWidth = computed(() => {
    if (usedBytes.value <= 0) return '0%'
    return `${Math.max(2, percent.value)}%`
  })

  const label = computed(() => {
    if (!storage.available) {
      return storage.kind === 'memory'
        ? '内存模式 · 刷新或关闭后丢失'
        : '仅当前标签页 · 关闭标签页后丢失'
    }
    if (level.value === 'danger') {
      return `占用 ${formatted.value} / 约 5 MB · 接近上限`
    }
    return `占用 ${formatted.value} / 约 5 MB`
  })

  function refresh() {
    measured.value = storage.usage()
  }

  return { usedBytes, percent, formatted, level, barWidth, label, isPersistent, refresh }
}

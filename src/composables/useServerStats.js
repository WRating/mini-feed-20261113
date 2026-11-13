/**
 * 服务端数据统计。
 *
 * 它是 `useStorageMeter` 的后继者。原来的职责是「浏览器 LocalStorage 占用 / 5MB 配额」，
 * 后端化后这套语义整体失效——数据在服务端内存里，既没有配额，也不存在
 * 「被浏览器禁用」的情况。保留下来的价值只有「你到底存了多少东西」这件事，
 * 数据源改为 `GET /api/stats`。
 *
 * 两个刻意的设计：
 *
 * 1. **字节数由服务端算**：前端拿不到 `Buffer`，用 `Blob` 估算 emoji 会算错
 *    （emoji 在 UTF-8 下 4 字节、UTF-16 下 2 码元），服务端算一次最准。
 *
 * 2. **失败时用 `available` 而不是把数字清零**：清零会与「真的没有数据」混淆，
 *    UI 也就无从判断该显示「0 条」还是「读不到」。因此失败只翻 available，
 *    旧值保留，由消费方决定隐藏还是置灰。
 */
import { computed, ref } from 'vue'
import { createApiClient } from '@/services/api-client'
import { formatBytes } from '@/utils/bytes'

let apiFactory = () => createApiClient()

/** 替换 API 客户端工厂（测试注入替身用） */
export function setStatsApiFactory(factory) {
  apiFactory = factory
}

/** 恢复默认工厂 */
export function resetStatsApiFactory() {
  apiFactory = () => createApiClient()
}

export function useServerStats() {
  const api = apiFactory()

  const posts = ref(0)
  const chars = ref(0)
  const bytes = ref(0)

  const loading = ref(false)
  /** 是否成功拿到过服务端数据（首次成功前为 false，用于隐藏而非显示 0） */
  const available = ref(false)
  const error = ref(null)

  const formatted = computed(() => formatBytes(bytes.value))

  /**
   * 交给子组件的必须是**已解包**的普通值。
   * 直接把含 ref 的对象当 prop 传下去，模板里对象字面量（:style / :class）
   * 不会自动解包，会拿到 Ref 对象——这个坑在上一版已经踩过一次。
   */
  const view = computed(() => ({
    posts: posts.value,
    chars: chars.value,
    bytes: bytes.value,
    formatted: formatted.value
  }))

  async function refresh() {
    // 防重复点击：多按几次不该打出多个请求
    if (loading.value) return

    loading.value = true
    error.value = null

    try {
      const stats = await api.getStats()

      // 不可信输入兜底：缺字段按 0，避免出现 NaN
      if (!stats || typeof stats !== 'object') {
        available.value = false
        error.value = '统计数据格式不正确'
        return
      }

      posts.value = Number.isFinite(stats.posts) ? stats.posts : 0
      chars.value = Number.isFinite(stats.chars) ? stats.chars : 0
      bytes.value = Number.isFinite(stats.bytes) ? stats.bytes : 0
      available.value = true
    } catch (cause) {
      // 失败不清零：保留上次成功的数字，仅标记不可用
      available.value = false
      error.value = cause?.message || '统计数据获取失败'
    } finally {
      loading.value = false
    }
  }

  return { posts, chars, bytes, formatted, loading, available, error, view, refresh }
}

/**
 * 动态 store —— 应用唯一的动态数据来源。
 *
 * 设计要点：
 * - 只暴露 actions 修改状态，读方通过 getter 派生，不直接改 posts
 * - 持久化集中在 persist()，任何写操作后立即落盘
 * - 读取历史数据时做一次过滤自愈，避免脏数据导致页面异常
 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { useStorage } from '@/services/storage-context'
import {
  MAX_LEN,
  createPost,
  canPublish,
  isValidPost,
  sortByCreatedAtDesc,
  isDuplicate
} from '@/utils/post'

const POSTS_KEY = 'posts'

export const usePostsStore = defineStore('posts', () => {
  const storage = useStorage()

  /** 从存储恢复；读取失败或数据损坏时退化为空列表 */
  function restore() {
    const raw = storage.read(POSTS_KEY)
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return sortByCreatedAtDesc(parsed.filter(isValidPost))
    } catch {
      return []
    }
  }

  const posts = ref(restore())
  const lastPublishedId = ref(null)

  const count = computed(() => posts.value.length)
  const isEmpty = computed(() => posts.value.length === 0)
  const totalChars = computed(() =>
    posts.value.reduce((sum, post) => sum + post.text.length, 0)
  )

  function persist() {
    storage.write(POSTS_KEY, JSON.stringify(posts.value))
  }

  /** 按 id 查找 */
  function getById(id) {
    return posts.value.find((post) => post.id === id)
  }

  /**
   * 发布一条动态。
   * 返回 { ok, post?, error? }，让 UI 能直接展示失败原因。
   */
  function publish(text) {
    if (typeof text !== 'string') {
      return { ok: false, error: '内容无效' }
    }
    if (!text.trim()) {
      return { ok: false, error: '内容不能为空' }
    }
    if (!canPublish(text)) {
      return { ok: false, error: `内容不能超过 ${MAX_LEN} 字` }
    }

    const post = createPost(text)
    posts.value = sortByCreatedAtDesc([post, ...posts.value])
    lastPublishedId.value = post.id
    persist()
    return { ok: true, post }
  }

  /** 删除一条动态，返回是否真的删掉了 */
  function remove(id) {
    const before = posts.value.length
    posts.value = posts.value.filter((post) => post.id !== id)
    const removed = posts.value.length < before
    if (removed) {
      if (lastPublishedId.value === id) lastPublishedId.value = null
      persist()
    }
    return removed
  }

  /**
   * 合并外部动态（用于导入备份）。
   * 按「内容 + 时间」去重，返回 { added, skipped } 供 UI 反馈。
   */
  function merge(incoming) {
    if (!Array.isArray(incoming) || incoming.length === 0) {
      return { added: 0, skipped: 0 }
    }

    const merged = [...posts.value]
    let added = 0
    let skipped = 0

    incoming.forEach((candidate) => {
      const post = isValidPost(candidate) ? createPost(candidate.text, candidate) : null
      if (!post || isDuplicate(merged, post)) {
        skipped += 1
        return
      }
      merged.push(post)
      added += 1
    })

    if (added > 0) {
      posts.value = sortByCreatedAtDesc(merged)
      persist()
    }
    return { added, skipped }
  }

  /** 清空全部动态 */
  function clear() {
    posts.value = []
    lastPublishedId.value = null
    storage.write(POSTS_KEY, JSON.stringify([]))
  }

  return {
    posts,
    lastPublishedId,
    count,
    isEmpty,
    totalChars,
    getById,
    publish,
    remove,
    merge,
    clear
  }
})

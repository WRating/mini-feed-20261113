/**
 * 动态 store —— 应用唯一的动态数据来源。
 *
 * 数据现在**存在服务端**，store 退化为「调用 API → 落到本地响应式状态」的搬运层。
 * 这带来两个必须守住的约定：
 *
 * 1. **本地列表是服务端状态的投影，不是真相**。所以每次写操作成功后都用服务端
 *    返回的结果覆盖本地（publish 用返回的 post 插头部，merge 直接用返回的完整列表），
 *    避免前后端对「真实数据」的认知出现分歧。
 *
 * 2. **失败必须留下痕迹**。网络问题不能只 return 个 false，否则 UI 无从解释。
 *    统一写进 `loadError`，让页面能展示「无法连接服务 + 重试」。
 *
 * 依赖注入沿用项目既有的工厂模式（同 profile store 的 setProfileApiFactory）。
 * 注意不要用 usePostsStore(api) —— Pinia 会把第一个参数当成 pinia 实例而崩。
 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { createApiClient } from '@/services/api-client'
import { toggleReaction as toggleReactionShape } from '@shared/post-shape'
import {
  MAX_LEN,
  canPublish,
  isValidPost,
  sortByCreatedAtDesc
} from '@/utils/post'

let apiFactory = () => createApiClient()

/** 替换 API 客户端工厂（测试注入替身用） */
export function setPostsApiFactory(factory) {
  apiFactory = factory
}

/** 恢复默认工厂 */
export function resetPostsApiFactory() {
  apiFactory = () => createApiClient()
}

/** 把任意异常转成可展示的中文文案：ApiError 已自带文案，其余兜底 */
function messageOf(error, fallback) {
  return error?.message || fallback
}

export const usePostsStore = defineStore('posts', () => {
  const api = apiFactory()

  const posts = ref([])
  const lastPublishedId = ref(null)

  /** 首次加载是否已完成（用于区分「空列表」与「还没加载」） */
  const loaded = ref(false)
  /** 请求进行中（UI 用来禁用按钮、展示骨架） */
  const loading = ref(false)
  /** 最近一次失败的文案；成功后清空 */
  const loadError = ref(null)

  /**
   * 正在切换互动状态的动态 id 集合。
   *
   * 按 post 维度而不是全局加锁：对 A 点赞时仍然可以给 B 收藏，
   * 只有**同一条**动态的重复点击需要被挡住 —— 那是「快速双击把计数打翻」的真实场景。
   * 用 Set 而不是单个 boolean，是因为多条动态的请求可以同时在飞。
   */
  const reactingIds = ref(new Set())

  const count = computed(() => posts.value.length)
  const isEmpty = computed(() => posts.value.length === 0)
  const totalChars = computed(() =>
    posts.value.reduce((sum, post) => sum + post.text.length, 0)
  )

  /** 某条动态是否正在切换互动状态（UI 据此禁用按钮） */
  function isReacting(id) {
    return reactingIds.value.has(id)
  }

  /** 用新对象替换列表中的那一项；返回是否命中 */
  function replacePost(next) {
    const index = posts.value.findIndex((post) => post.id === next.id)
    if (index === -1) return false
    // 整体替换而不是就地改字段：与「服务端返回的对象覆盖本地副本」保持同一语义，
    // 也保证依赖引用变化的渲染能可靠触发。
    posts.value = posts.value.map((post, i) => (i === index ? next : post))
    return true
  }

  /** 记录失败并返回文案；集中一处，避免每个 action 各写一遍 */
  function fail(error, fallback = '操作失败') {
    const message = messageOf(error, fallback)
    loadError.value = message
    return message
  }

  function clearError() {
    loadError.value = null
  }

  /**
   * 从服务端拉取列表。
   * 不向外抛错：加载失败是**预期内的常态**（后端没启动），
   * 交给 loadError + loaded 让 UI 决定展示什么。
   */
  async function load() {
    if (loading.value) return

    loading.value = true
    clearError()

    try {
      const list = await api.listPosts()
      // 服务端理论上已倒序，这里再排一次是廉价的自愈：
      // 即使后端换了实现或经过中间层，前端展示顺序也不会错。
      posts.value = sortByCreatedAtDesc(list.filter(isValidPost))
      loaded.value = true
    } catch (error) {
      // 刻意不动 posts：保留上一次成功的数据，总比清空成白屏好。
      loadError.value = messageOf(error, '加载失败')
    } finally {
      loading.value = false
    }
  }

  /** 按 id 查找 */
  function getById(id) {
    return posts.value.find((post) => post.id === id)
  }

  /**
   * 发布一条动态。
   * 返回 { ok, post?, error? }，让 UI 能直接展示失败原因（App.vue 依赖此形状）。
   *
   * 本地先做一次校验只是**即时反馈**（省一次往返），服务端才是唯一权威；
   * 所以这里仍然要处理服务端返回的 TOO_LONG / EMPTY。
   */
  async function publish(text) {
    if (typeof text !== 'string') {
      return { ok: false, error: '内容无效' }
    }
    if (!text.trim()) {
      return { ok: false, error: '内容不能为空' }
    }
    if (!canPublish(text)) {
      return { ok: false, error: `内容不能超过 ${MAX_LEN} 字` }
    }

    try {
      const post = await api.createPost(text)
      posts.value = sortByCreatedAtDesc([post, ...posts.value])
      lastPublishedId.value = post.id
      clearError()
      return { ok: true, post }
    } catch (error) {
      // 关键：失败时不改列表。内容由 UI 保留在输入框里（契约第 6 节）。
      return { ok: false, error: fail(error, '发布失败') }
    }
  }

  /**
   * 删除一条动态，返回是否真的删掉了。
   * 本地不存在该 id 时直接返回 false，省一次必然 404 的请求。
   */
  async function remove(id) {
    if (!getById(id)) return false

    try {
      await api.removePost(id)
      posts.value = posts.value.filter((post) => post.id !== id)
      if (lastPublishedId.value === id) lastPublishedId.value = null
      clearError()
      return true
    } catch (error) {
      fail(error, '删除失败')
      return false
    }
  }

  /**
   * 切换点赞 / 收藏状态，返回 { ok, error? }。
   *
   * 三段式，顺序都不能换：
   *
   * 1. **并发保护**：同一条动态已有请求在飞时直接返回。放在乐观更新之前，
   *    否则第二次点击会先把状态翻回去，等第一个请求回来又被覆盖成原样，
   *    用户看到的是「点了没反应」。不同动态之间互不阻塞。
   *
   * 2. **乐观更新**：先本地改状态让界面立刻响应（契约 6.1 第 6 条）。
   *    迁移规则**必须**调用 shared/post-shape.js 的 toggleReaction —— 两端共用同一份，
   *    自己再写一份很容易在「脏数据（负数计数 / 非布尔标记）」上算出不同结果，
   *    表现为「点一下高亮了，刷新后又没了」。
   *
   * 3. **失败回滚 / 成功覆盖**：回滚到**调用前快照**而不是反向再 toggle 一次 ——
   *    若期间服务端状态已变，反向 toggle 会算出第三个值。成功后用服务端返回的
   *    Post 覆盖本地副本，因为本地推算不知道「别人也点了赞」这类事实。
   */
  async function toggleReaction(id, kind) {
    const target = getById(id)
    if (!target) return { ok: false, error: '动态不存在' }
    // ignored 让调用方能区分「被并发保护挡下」与「真的失败了」：
    // 前者不该弹错误提示（用户只是手快），后者必须提示。
    if (isReacting(id)) return { ok: false, error: '操作进行中，请稍候', ignored: true }

    const snapshot = { ...target }
    reactingIds.value.add(id)
    try {
      // ① 乐观更新
      replacePost({ ...target, ...toggleReactionShape(target, kind) })

      // ② 以服务端返回为准
      const updated = await api.setReaction(id, kind)
      // 列表可能在请求期间被整体替换过（例如后台刷新），替换失败不算错误：
      // 服务端已经改了，下一次 load 自然会同步回来。
      replacePost(updated)
      clearError()
      return { ok: true }
    } catch (error) {
      // ③ 回滚到调用前的快照
      replacePost(snapshot)
      return { ok: false, error: fail(error, '操作失败') }
    } finally {
      // 无论成败都要解除保护，否则按钮会永久禁用
      reactingIds.value.delete(id)
    }
  }

  /**
   * 合并外部动态（用于导入备份）。
   * 去重、截断、跳过非法条目的规则全在服务端（契约 4.7），
   * 这里直接用返回的完整列表覆盖本地，省一次 GET。
   */
  async function merge(incoming) {
    if (!Array.isArray(incoming) || incoming.length === 0) {
      return { added: 0, skipped: 0 }
    }

    try {
      const result = await api.mergePosts(incoming)
      posts.value = sortByCreatedAtDesc((result.posts || []).filter(isValidPost))
      clearError()
      return { added: result.added, skipped: result.skipped }
    } catch (error) {
      fail(error, '导入失败')
      return { added: 0, skipped: 0 }
    }
  }

  /** 清空全部动态（服务端会保留个人资料） */
  async function clear() {
    try {
      await api.clearPosts()
      posts.value = []
      lastPublishedId.value = null
      clearError()
    } catch (error) {
      // 没删干净就不能骗用户：保留列表并留下错误
      fail(error, '清空失败')
    }
  }

  return {
    posts,
    lastPublishedId,
    loading,
    loadError,
    loaded,
    count,
    isEmpty,
    totalChars,
    isReacting,
    getById,
    load,
    publish,
    remove,
    toggleReaction,
    merge,
    clear
  }
})

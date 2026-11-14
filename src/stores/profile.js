/**
 * 个人资料 store。
 *
 * 资料的**归属**已从浏览器挪到服务端：joinedAt 由服务端在创建/重置时确定，
 * 任何 patch 都无法改写它（契约 4.10）。因此这里不再有 persist()，
 * 也没有逐字段的本地规范化 —— 服务端返回什么，就以什么为准回写本地。
 *
 * 唯一保留的本地校验是「不信任远端数据」的读取兜底：服务端万一返回了非法头像或
 * 缺失字段，本地回退默认值而不是把脏数据塞进 UI。
 *
 * 依赖注入沿用工厂模式（同 posts），不要用 useProfileStore(api)。
 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { createApiClient } from '@/services/api-client'
import { daysSince } from '@/utils/time'
import { isValidMood, moodView as toMoodView } from '@shared/mood'
import {
  AVATARS,
  NAME_MAX,
  BIO_MAX,
  DEFAULT_NAME,
  DEFAULT_BIO,
  DEFAULT_AVATAR,
  DEFAULT_MOOD,
  MOODS
} from '@shared/constants'

// 从共享常量 re-export：UI 与旧调用方仍在用这些名字，避免两处魔数漂移
export { AVATARS, NAME_MAX, BIO_MAX, MOODS }

let apiFactory = () => createApiClient()

/** 替换 API 客户端工厂（测试注入替身用） */
export function setProfileApiFactory(factory) {
  apiFactory = factory
}

/** 恢复默认工厂 */
export function resetProfileApiFactory() {
  apiFactory = () => createApiClient()
}

export const useProfileStore = defineStore('profile', () => {
  const api = apiFactory()

  // 初值用默认资料：首屏在请求回来之前就有内容可渲染，避免闪空白。
  const name = ref(DEFAULT_NAME)
  const bio = ref(DEFAULT_BIO)
  const avatar = ref(DEFAULT_AVATAR)
  /** 今日心情，属于 profile 的一部分（复用 PUT /api/profile，无需单独端点） */
  const mood = ref(DEFAULT_MOOD)
  const joinedAt = ref(Date.now())

  const loading = ref(false)
  const loadError = ref(null)

  /** 使用天数（含首日） */
  const daysUsed = computed(() => daysSince(joinedAt.value))

  /**
   * 是否仍是初始资料（用于判断导入备份时能否覆盖资料）。
   * 与后端保持一致：**只看 name / bio / avatar，不含 mood**。
   * 心情是随手可切的轻量状态，不该让用户"因为点过心情就恢复不了昵称"。
   */
  const isDefault = computed(
    () => name.value === DEFAULT_NAME && bio.value === DEFAULT_BIO && avatar.value === DEFAULT_AVATAR
  )

  /** 心情的展示信息（表情 + 文案），非法值自动回落默认，UI 无需再判断 */
  const moodView = computed(() => toMoodView(mood.value))

  /**
   * 把服务端下发的资料落到本地状态，逐字段校验。
   *
   * 为什么要校验：这是**不可信输入**（可能来自被改过的后端、代理注入、旧版本接口）。
   * 一个非法 avatar 会让 UI 渲染出空白头像且无人知道原因，回退默认值则至少可用。
   */
  function apply(profile) {
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return

    if (typeof profile.name === 'string' && profile.name.trim()) {
      name.value = profile.name.trim().slice(0, NAME_MAX)
    }
    if (typeof profile.bio === 'string') {
      bio.value = profile.bio.slice(0, BIO_MAX)
    }
    if (typeof profile.avatar === 'string' && AVATARS.includes(profile.avatar)) {
      avatar.value = profile.avatar
    }
    // 心情非法或缺失时保留原值：同 avatar 一样属于「不可信远端输入」的兜底。
    // 注意不回落成空字符串 —— 那会让卡片渲染出空白表情，用户以为什么都坏了。
    if (isValidMood(profile.mood)) {
      mood.value = profile.mood
    }
    // joinedAt 非有限数时保留原值：编造一个时间比沿用旧值更容易误导「使用天数」
    if (Number.isFinite(profile.joinedAt)) {
      joinedAt.value = profile.joinedAt
    }
  }

  function fail(error, fallback) {
    const message = error?.message || fallback
    loadError.value = message
    return message
  }

  /** 从服务端读取资料。失败不抛错，交给 loadError 让 UI 展示重试。 */
  async function load() {
    if (loading.value) return

    loading.value = true
    loadError.value = null

    try {
      apply(await api.getProfile())
    } catch (error) {
      fail(error, '资料加载失败')
    } finally {
      loading.value = false
    }
  }

  /**
   * 更新资料。只提交显式传入的 name / bio / avatar，其余字段一律忽略 ——
   * 因此 joinedAt 不可能被表单误改（服务端也会再挡一次）。
   *
   * 返回 { ok, error? }：调用方据此决定是否提示「已保存」。
   */
  async function update(patch = {}) {
    if (!patch || typeof patch !== 'object') return { ok: true }

    const payload = {}
    if (patch.name !== undefined) payload.name = patch.name
    if (patch.bio !== undefined) payload.bio = patch.bio
    if (patch.avatar !== undefined) payload.avatar = patch.avatar

    // 没有任何可提交字段就什么都不做，避免一次无意义的 PUT
    if (Object.keys(payload).length === 0) return { ok: true }

    try {
      // 注意：不在这里静默过滤非法头像。契约 4.10 明确要求让服务端报
      // INVALID_AVATAR，好让前端 bug 尽早暴露，而不是被悄悄吞掉。
      apply(await api.updateProfile(payload))
      loadError.value = null
      return { ok: true }
    } catch (error) {
      return { ok: false, error: fail(error, '资料保存失败') }
    }
  }

  /**
   * 用备份中的资料恢复 —— 是否应用由**服务端**判定（当前资料仍是默认值才应用），
   * 这样多端/多标签页下也不会出现「本地以为没改、实际已改」的误覆盖。
   * 返回是否真的应用了。
   */
  async function restoreFromBackup(backupProfile) {
    if (!backupProfile || typeof backupProfile !== 'object') return false

    try {
      const result = await api.restoreProfile(backupProfile)
      if (!result || !result.applied) {
        // 未应用也是成功响应：同步一次服务端现状，保证本地与服务端一致
        if (result?.profile) apply(result.profile)
        return false
      }

      apply(result.profile)
      loadError.value = null
      return true
    } catch (error) {
      fail(error, '资料恢复失败')
      return false
    }
  }

  /**
   * 切换今日心情。
   *
   * 与点赞同样是「高频轻量操作」，因此先改本地让表情立刻变化，失败再回滚。
   * 非法键在本地就挡掉：服务端必然会以 INVALID_MOOD 拒绝，白跑一次请求没意义。
   *
   * 返回 { ok, error? } 供调用方决定是否提示。
   */
  async function setMood(next) {
    if (!isValidMood(next)) {
      return { ok: false, error: '未知的心情' }
    }
    // 选中的就是当前心情：不发请求（避免无意义的写入与按钮闪烁）
    if (next === mood.value) {
      return { ok: true }
    }

    const previous = mood.value
    mood.value = next

    try {
      const updated = await api.updateProfile({ mood: next })
      // 以服务端返回为准，而不是继续用本地推测的值
      apply(updated)
      loadError.value = null
      return { ok: true }
    } catch (error) {
      // 回滚：失败后表情不能停在用户选的那个，否则与服务端不一致
      mood.value = previous
      return { ok: false, error: fail(error, '心情保存失败') }
    }
  }

  /**
   * 重置为默认资料；joinedAt 由服务端刷新为当下
   */
  async function reset() {
    try {
      apply(await api.resetProfile())
      loadError.value = null
    } catch (error) {
      // 没重置成功就不能假装成功：保留原资料并留下错误
      fail(error, '资料重置失败')
    }
  }

  return {
    avatars: AVATARS,
    moods: MOODS,
    name,
    bio,
    avatar,
    mood,
    moodView,
    joinedAt,
    loading,
    loadError,
    daysUsed,
    isDefault,
    load,
    update,
    setMood,
    restoreFromBackup,
    reset
  }
})

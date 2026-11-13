/**
 * 个人资料 store。
 *
 * 约束集中在这里，UI 只负责传值：
 * 昵称 ≤20 字、简介 ≤60 字、头像必须来自可选列表。
 * joinedAt 只由 store 自己维护，避免被表单误改。
 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { useStorage } from '@/services/storage-context'
import { daysSince } from '@/utils/time'

const PROFILE_KEY = 'profile'

export const AVATARS = ['🙂', '😀', '🐱', '🐼', '🦊', '🚀', '🌙', '🍀', '🎧', '📚']

export const NAME_MAX = 20
export const BIO_MAX = 60

const DEFAULT_NAME = '我'
const DEFAULT_BIO = '这个人很懒，什么都没写。'
const DEFAULT_AVATAR = '🙂'

export const useProfileStore = defineStore('profile', () => {
  const storage = useStorage()

  const joinedAt = ref(Date.now())
  const name = ref(DEFAULT_NAME)
  const bio = ref(DEFAULT_BIO)
  const avatar = ref(DEFAULT_AVATAR)

  /** 逐项校验后载入，任何字段不合法都单独回退到默认值 */
  function restore() {
    const raw = storage.read(PROFILE_KEY)
    if (!raw) return false
    try {
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false

      if (typeof parsed.name === 'string' && parsed.name.trim()) {
        name.value = parsed.name.trim().slice(0, NAME_MAX)
      }
      if (typeof parsed.bio === 'string') {
        bio.value = parsed.bio.slice(0, BIO_MAX)
      }
      if (typeof parsed.avatar === 'string' && AVATARS.includes(parsed.avatar)) {
        avatar.value = parsed.avatar
      }
      if (Number.isFinite(parsed.joinedAt)) {
        joinedAt.value = parsed.joinedAt
      }
      return true
    } catch {
      return false
    }
  }

  function persist() {
    storage.write(
      PROFILE_KEY,
      JSON.stringify({
        name: name.value,
        bio: bio.value,
        avatar: avatar.value,
        joinedAt: joinedAt.value
      })
    )
  }

  restore()
  persist() // 首次运行时把默认值落盘，保证 joinedAt 有稳定起点

  /** 使用天数（含首日） */
  const daysUsed = computed(() => daysSince(joinedAt.value))

  /** 是否仍是初始资料（用于判断导入备份时能否覆盖资料） */
  const isDefault = computed(
    () => name.value === DEFAULT_NAME && bio.value === DEFAULT_BIO && avatar.value === DEFAULT_AVATAR
  )

  /**
   * 更新资料。只接受 name / bio / avatar，其余字段一律忽略，
   * 因此 joinedAt 不会被外部改掉。
   */
  function update(patch = {}) {
    if (!patch || typeof patch !== 'object') return

    if (typeof patch.name === 'string') {
      const next = patch.name.trim().slice(0, NAME_MAX)
      name.value = next || DEFAULT_NAME
    }
    if (typeof patch.bio === 'string') {
      bio.value = patch.bio.trim().slice(0, BIO_MAX)
    }
    if (typeof patch.avatar === 'string' && AVATARS.includes(patch.avatar)) {
      avatar.value = patch.avatar
    }
    persist()
  }

  /**
   * 用备份中的资料恢复 —— 仅在本地资料仍是默认值时才生效，
   * 避免用户已自定义的信息被备份覆盖。返回是否真的应用了。
   */
  function restoreFromBackup(backupProfile) {
    if (!backupProfile || typeof backupProfile !== 'object') return false
    if (!isDefault.value) return false

    let applied = false
    if (typeof backupProfile.name === 'string' && backupProfile.name.trim()) {
      name.value = backupProfile.name.trim().slice(0, NAME_MAX)
      applied = true
    }
    if (typeof backupProfile.bio === 'string' && backupProfile.bio.trim()) {
      bio.value = backupProfile.bio.trim().slice(0, BIO_MAX)
      applied = true
    }
    if (typeof backupProfile.avatar === 'string' && AVATARS.includes(backupProfile.avatar)) {
      avatar.value = backupProfile.avatar
      applied = true
    }

    if (applied) persist()
    return applied
  }

  /** 重置为默认资料，并以当下作为新的使用起点 */
  function reset() {
    name.value = DEFAULT_NAME
    bio.value = DEFAULT_BIO
    avatar.value = DEFAULT_AVATAR
    joinedAt.value = Date.now()
    persist()
  }

  return {
    avatars: AVATARS,
    name,
    bio,
    avatar,
    joinedAt,
    daysUsed,
    isDefault,
    update,
    restoreFromBackup,
    reset
  }
})

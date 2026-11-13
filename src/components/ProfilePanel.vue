<script setup>
/**
 * 个人资料卡：展示资料与统计，并在展开的表单里编辑。
 * 组件内部只维护「草稿」（编辑中的临时值），保存时以事件上报，
 * 真正的状态由 store 持有 —— 这样取消编辑不会污染真实数据。
 */
import { computed, nextTick, ref, useTemplateRef } from 'vue'
import { formatDayLabel } from '@/utils/time'

const props = defineProps({
  profile: { type: Object, required: true },
  stats: {
    type: Object,
    default: () => ({ posts: 0, chars: 0, days: 1 })
  },
  avatars: { type: Array, default: () => [] }
})

const emit = defineEmits(['save'])

const NAME_MAX = 20
const BIO_MAX = 60

const editing = ref(false)
const draftName = ref('')
const draftBio = ref('')
const draftAvatar = ref('')
const nameInputRef = useTemplateRef('nameInput')

const joinedLabel = computed(() => {
  const time = props.profile?.joinedAt
  if (!time) return ''
  return `加入于 ${formatDayLabel(time)}`
})

/** 打开表单：把当前真实值灌进草稿，保证每次都从干净状态开始 */
function openEditor() {
  draftName.value = props.profile?.name ?? ''
  draftBio.value = props.profile?.bio ?? ''
  draftAvatar.value = props.profile?.avatar ?? ''
  editing.value = true
  nextTick(() => nameInputRef.value?.focus())
}

function closeEditor() {
  editing.value = false
}

/**
 * 保存。表单 submit 与按钮 click 都可能触发（浏览器点击 submit 按钮会先发 click
 * 再发 submit），因此这里用 editing 作为守卫保证只执行一次。
 */
function save() {
  if (!editing.value) return
  emit('save', {
    name: draftName.value,
    bio: draftBio.value,
    avatar: draftAvatar.value
  })
  editing.value = false
}

function selectAvatar(avatar) {
  draftAvatar.value = avatar
}

function onFormKeydown(event) {
  if (event.key === 'Escape') closeEditor()
}

defineExpose({ closeEditor, isEditing: computed(() => editing.value) })
</script>

<template>
  <div class="profile-card card">
    <div class="profile-main">
      <div data-testid="profile-avatar" class="avatar avatar-lg">{{ profile.avatar }}</div>
      <div class="profile-meta">
        <h2 data-testid="profile-name" class="profile-name">{{ profile.name }}</h2>
        <p data-testid="profile-bio" class="profile-bio">{{ profile.bio }}</p>
        <p v-if="joinedLabel" data-testid="profile-since" class="profile-since">
          {{ joinedLabel }}
        </p>
      </div>
      <button data-testid="edit-btn" class="btn-ghost" type="button" @click="openEditor">
        编辑资料
      </button>
    </div>

    <form
      v-if="editing"
      data-testid="profile-form"
      class="profile-form"
      @submit.prevent="save"
      @keydown="onFormKeydown"
    >      <label class="field">
        <span class="field-label">昵称</span>
        <input
          ref="nameInput"
          v-model="draftName"
          data-testid="name-input"
          class="field-input"
          type="text"
          :maxlength="NAME_MAX"
          placeholder="给自己起个名字"
        >
      </label>

      <label class="field">
        <span class="field-label">简介</span>
        <input
          v-model="draftBio"
          data-testid="bio-input"
          class="field-input"
          type="text"
          :maxlength="BIO_MAX"
          placeholder="一句话介绍自己"
        >
      </label>

      <div class="field">
        <span class="field-label">头像</span>
        <div class="avatar-picker">
          <button
            v-for="avatar in avatars"
            :key="avatar"
            data-testid="avatar-option"
            class="avatar-option"
            :class="{ 'is-active': avatar === draftAvatar }"
            type="button"
            :aria-pressed="avatar === draftAvatar"
            @click="selectAvatar(avatar)"
          >
            {{ avatar }}
          </button>
        </div>
      </div>

      <div class="form-actions">
        <button data-testid="cancel-btn" class="btn-ghost" type="button" @click="closeEditor">
          取消
        </button>
        <button data-testid="save-btn" class="btn-primary" type="button" @click="save">
          保存
        </button>
      </div>
    </form>

    <div class="stats">
      <div class="stat">
        <span data-testid="stat-posts" class="stat-value">{{ stats.posts }}</span>
        <span class="stat-label">动态</span>
      </div>
      <div class="stat">
        <span data-testid="stat-chars" class="stat-value">{{ stats.chars }}</span>
        <span class="stat-label">累计字数</span>
      </div>
      <div class="stat">
        <span data-testid="stat-days" class="stat-value">{{ stats.days }}</span>
        <span class="stat-label">使用天数</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.profile-card {
  padding: 16px;
}

.profile-main {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.profile-meta {
  flex: 1;
  min-width: 0;
}

.profile-name {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text);
}

.profile-bio {
  font-size: 0.85rem;
  color: var(--text-secondary);
  margin-top: 2px;
  overflow-wrap: anywhere;
}

.profile-since {
  font-size: 0.74rem;
  color: var(--text-secondary);
  margin-top: 4px;
}

.profile-form {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px dashed var(--border);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.field-label {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.field-input {
  border: 1px solid var(--border);
  border-radius: 9px;
  padding: 8px 11px;
  font-family: inherit;
  font-size: 0.9rem;
  color: var(--text);
  background: #fbfcfe;
  outline: none;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.field-input:focus {
  border-color: var(--accent);
  background: #fff;
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.avatar-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.avatar-option {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: #fff;
  font-size: 1.1rem;
  cursor: pointer;
  transition: border-color 0.18s ease, transform 0.18s ease;
}

.avatar-option:hover {
  transform: translateY(-1px);
}

.avatar-option.is-active {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.stats {
  display: flex;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--border);
}

.stat {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.stat-value {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.stat-label {
  font-size: 0.74rem;
  color: var(--text-secondary);
}
</style>

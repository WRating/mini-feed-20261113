<script setup>
/**
 * 动态卡片：展示一条动态，并把「打开详情」「删除」的意图上报给父级。
 * 正文使用插值渲染（等价 textContent），天然防 XSS。
 */
import { computed } from 'vue'
import { formatRelativeTime } from '@/utils/time'

const props = defineProps({
  post: { type: Object, required: true },
  author: { type: Object, default: null },
  highlight: { type: Boolean, default: false },
  removable: { type: Boolean, default: true }
})

const emit = defineEmits(['open', 'remove'])

const FALLBACK_AUTHOR = { name: '我', avatar: '🙂' }

const authorName = computed(() => props.author?.name || FALLBACK_AUTHOR.name)
const authorAvatar = computed(() => props.author?.avatar || FALLBACK_AUTHOR.avatar)
const relativeTime = computed(() => formatRelativeTime(props.post.createdAt))
</script>

<template>
  <article
    data-testid="post-card"
    class="post card"
    :class="{ 'is-new': highlight }"
  >
    <div class="post-head">
      <span data-testid="post-avatar" class="avatar avatar-sm" aria-hidden="true">
        {{ authorAvatar }}
      </span>
      <div class="post-meta">
        <span data-testid="post-author" class="post-author">{{ authorName }}</span>
        <span data-testid="post-time" class="post-time">{{ relativeTime }}</span>
      </div>
    </div>

    <p
      data-testid="post-body"
      class="post-body"
      tabindex="0"
      role="button"
      aria-label="查看这条动态的详情"
      @click="emit('open', post.id)"
      @keydown.enter.prevent="emit('open', post.id)"
    >
      <span data-testid="post-text" class="post-text">{{ post.text }}</span>
    </p>

    <div class="post-actions">
      <button data-testid="open-btn" class="btn-link" type="button" @click="emit('open', post.id)">
        查看详情
      </button>
      <button
        v-if="removable"
        data-testid="delete-btn"
        class="btn-link is-danger"
        type="button"
        aria-label="删除这条动态"
        @click="emit('remove', post.id)"
      >
        删除
      </button>
    </div>
  </article>
</template>

<style scoped>
.post {
  padding: 14px 16px;
  transition: box-shadow 0.2s ease, border-color 0.2s ease;
}

.post.is-new {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.post-head {
  display: flex;
  align-items: center;
  gap: 9px;
}

.avatar-sm {
  width: 34px;
  height: 34px;
  font-size: 1.05rem;
}

.post-meta {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
  min-width: 0;
}

.post-author {
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--text);
}

.post-time {
  font-size: 0.74rem;
  color: var(--text-secondary);
}

.post-body {
  margin: 10px 0 8px;
  cursor: pointer;
  border-radius: 8px;
  outline: none;
}

.post-body:focus-visible {
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.post-text {
  display: block;
  font-size: 0.94rem;
  line-height: 1.68;
  color: var(--text);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.post-actions {
  display: flex;
  gap: 16px;
  border-top: 1px solid var(--border);
  padding-top: 8px;
}
</style>

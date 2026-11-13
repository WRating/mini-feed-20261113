<script setup>
/**
 * 动态卡片：展示一条动态，并把「打开详情」「删除」「点赞」「收藏」的意图上报给父级。
 * 正文使用插值渲染（等价 textContent），天然防 XSS。
 *
 * 互动计数与选中态都从 shared 的 normalizeReactions 取，而不是直接读 post.likes：
 * 旧数据可能缺少互动字段（契约 4.3 的向后兼容），直接读会渲染出 undefined；
 * 规范化还能顺带修正「标记为真但计数为 0」这种不自洽的数据。
 */
import { computed } from 'vue'
import { normalizeReactions } from '@shared/post-shape'
import { formatRelativeTime } from '@/utils/time'

const props = defineProps({
  post: { type: Object, required: true },
  author: { type: Object, default: null },
  highlight: { type: Boolean, default: false },
  removable: { type: Boolean, default: true },
  /** 该条的互动请求是否在飞：用于禁用按钮，避免快速双击把计数打翻 */
  reacting: { type: Boolean, default: false }
})

const emit = defineEmits(['open', 'remove', 'like', 'favorite'])

const FALLBACK_AUTHOR = { name: '我', avatar: '🙂' }

const authorName = computed(() => props.author?.name || FALLBACK_AUTHOR.name)
const authorAvatar = computed(() => props.author?.avatar || FALLBACK_AUTHOR.avatar)
const relativeTime = computed(() => formatRelativeTime(props.post.createdAt))

const reactions = computed(() => normalizeReactions(props.post))
const likeCount = computed(() => reactions.value.likes)
const favoriteCount = computed(() => reactions.value.favorites)

/**
 * 统一的互动上报入口。
 * 请求进行中直接返回：`disabled` 只挡用户交互，挡不住程序化的 dispatchEvent，
 * 这里再判一次才能保证「禁用态不会发出第二个请求意图」。
 */
function react(kind) {
  if (props.reacting) return
  emit(kind, props.post.id)
}
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
      <!-- @click.stop：卡片主体点击即进详情，互动按钮必须阻止冒泡，否则点个赞会跳走 -->
      <button
        data-testid="like-btn"
        class="react-btn"
        :class="{ 'is-active': reactions.liked }"
        type="button"
        :disabled="reacting"
        :aria-pressed="reactions.liked ? 'true' : 'false'"
        :aria-label="reactions.liked ? '取消点赞' : '点赞'"
        @click.stop="react('like')"
      >
        <span class="react-icon" aria-hidden="true">{{ reactions.liked ? '♥' : '♡' }}</span>
        <span data-testid="like-count" class="react-count">{{ likeCount }}</span>
      </button>

      <button
        data-testid="favorite-btn"
        class="react-btn"
        :class="{ 'is-active': reactions.favorited }"
        type="button"
        :disabled="reacting"
        :aria-pressed="reactions.favorited ? 'true' : 'false'"
        :aria-label="reactions.favorited ? '取消收藏' : '收藏'"
        @click.stop="react('favorite')"
      >
        <span class="react-icon" aria-hidden="true">{{ reactions.favorited ? '★' : '☆' }}</span>
        <span data-testid="favorite-count" class="react-count">{{ favoriteCount }}</span>
      </button>

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
  align-items: center;
  gap: 16px;
  border-top: 1px solid var(--border);
  padding-top: 8px;
}

.react-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 9px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.82rem;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition: color 0.15s ease, background 0.15s ease, border-color 0.15s ease;
}

.react-btn:hover:not(:disabled) {
  color: var(--accent);
  background: var(--accent-soft);
}

/* 选中态必须足够明显：这是用户判断「我到底点没点上」的唯一依据 */
.react-btn.is-active {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-soft);
  font-weight: 600;
}

/* 请求中禁用：降低不透明度并改回默认光标，避免被误认为可点 */
.react-btn:disabled {
  opacity: 0.55;
  cursor: default;
}

.react-icon {
  font-size: 0.95rem;
  line-height: 1;
}
</style>

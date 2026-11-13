<script setup>
/**
 * 动态详情：展示完整正文、精确时间与字数，并提供与卡片一致的点赞 / 收藏入口。
 * post 可能为空（例如刚被删除或存储异常），此时给出明确提示而不是白屏。
 * 与 PostCard 一样只上报意图，状态变更由 store 负责。
 */
import { computed } from 'vue'
import { normalizeReactions } from '@shared/post-shape'
import { formatExactTime } from '@/utils/time'

const props = defineProps({
  post: { type: Object, default: null },
  author: { type: Object, default: null },
  removable: { type: Boolean, default: true },
  /** 该条的互动请求是否在飞：用于禁用按钮 */
  reacting: { type: Boolean, default: false }
})

const emit = defineEmits(['back', 'remove', 'like', 'favorite'])

const authorName = computed(() => props.author?.name || '我')
const authorAvatar = computed(() => props.author?.avatar || '🙂')
const exactTime = computed(() => (props.post ? formatExactTime(props.post.createdAt) : ''))
const charCount = computed(() => props.post?.text?.length || 0)

/** 规范化后再展示：详情页也可能拿到缺字段（旧数据）或被改过的 Post */
const reactions = computed(() => normalizeReactions(props.post))

function react(kind) {
  if (props.reacting || !props.post) return
  emit(kind, props.post.id)
}
</script>

<template>
  <div class="detail-wrap">
    <button class="btn-ghost back-btn" type="button" @click="emit('back')">← 返回</button>

    <div v-if="!post" data-testid="detail-missing" class="card detail-missing">
      <p class="missing-title">这条动态不存在</p>
      <p class="missing-hint">它可能已被删除，或本地数据被清理过。</p>
    </div>

    <article v-else id="detail-post" class="card detail-post">
      <div class="detail-head">
        <span data-testid="detail-avatar" class="avatar" aria-hidden="true">{{ authorAvatar }}</span>
        <div class="detail-meta">
          <span data-testid="detail-author" class="detail-author">{{ authorName }}</span>
          <span data-testid="detail-time" class="detail-time">{{ exactTime }}</span>
        </div>
      </div>

      <p data-testid="detail-text" class="detail-text">{{ post.text }}</p>

      <div class="detail-reactions">
        <button
          data-testid="like-btn"
          class="react-btn"
          :class="{ 'is-active': reactions.liked }"
          type="button"
          :disabled="reacting"
          :aria-pressed="reactions.liked ? 'true' : 'false'"
          :aria-label="reactions.liked ? '取消点赞' : '点赞'"
          @click="react('like')"
        >
          <span class="react-icon" aria-hidden="true">{{ reactions.liked ? '♥' : '♡' }}</span>
          <span data-testid="like-count" class="react-count">{{ reactions.likes }}</span>
        </button>

        <button
          data-testid="favorite-btn"
          class="react-btn"
          :class="{ 'is-active': reactions.favorited }"
          type="button"
          :disabled="reacting"
          :aria-pressed="reactions.favorited ? 'true' : 'false'"
          :aria-label="reactions.favorited ? '取消收藏' : '收藏'"
          @click="react('favorite')"
        >
          <span class="react-icon" aria-hidden="true">{{ reactions.favorited ? '★' : '☆' }}</span>
          <span data-testid="favorite-count" class="react-count">{{ reactions.favorites }}</span>
        </button>
      </div>

      <div class="detail-foot">
        <span data-testid="detail-chars" class="detail-chars">共 {{ charCount }} 字</span>
        <button
          v-if="removable"
          data-testid="delete-btn"
          class="btn-link is-danger"
          type="button"
          @click="emit('remove', post.id)"
        >
          删除
        </button>
      </div>
    </article>
  </div>
</template>

<style scoped>
.back-btn {
  margin-bottom: 12px;
}

.detail-post {
  padding: 18px;
}

.detail-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.detail-meta {
  display: flex;
  flex-direction: column;
  line-height: 1.35;
}

.detail-author {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text);
}

.detail-time {
  font-size: 0.76rem;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.detail-text {
  margin: 14px 0;
  font-size: 1rem;
  line-height: 1.75;
  color: var(--text);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.detail-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid var(--border);
  padding-top: 10px;
}

.detail-chars {
  font-size: 0.78rem;
  color: var(--text-secondary);
}

.detail-reactions {
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
}

.react-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 13px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition: color 0.15s ease, background 0.15s ease, border-color 0.15s ease;
}

.react-btn:hover:not(:disabled) {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-soft);
}

.react-btn.is-active {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-soft);
  font-weight: 600;
}

.react-btn:disabled {
  opacity: 0.55;
  cursor: default;
}

.react-icon {
  font-size: 1rem;
  line-height: 1;
}

.detail-missing {
  padding: 24px 18px;
  text-align: center;
}

.missing-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text);
}

.missing-hint {
  font-size: 0.8rem;
  color: var(--text-secondary);
  margin-top: 6px;
}
</style>

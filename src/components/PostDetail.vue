<script setup>
/**
 * 动态详情：展示完整正文、精确时间与字数。
 * post 可能为空（例如刚被删除或存储异常），此时给出明确提示而不是白屏。
 */
import { computed } from 'vue'
import { formatExactTime } from '@/utils/time'

const props = defineProps({
  post: { type: Object, default: null },
  author: { type: Object, default: null },
  removable: { type: Boolean, default: true }
})

const emit = defineEmits(['back', 'remove'])

const authorName = computed(() => props.author?.name || '我')
const authorAvatar = computed(() => props.author?.avatar || '🙂')
const exactTime = computed(() => (props.post ? formatExactTime(props.post.createdAt) : ''))
const charCount = computed(() => props.post?.text?.length || 0)
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

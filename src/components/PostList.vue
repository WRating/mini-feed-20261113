<script setup>
/**
 * 动态列表：按给定顺序渲染卡片，空列表时展示空状态。
 * 排序由数据源保证，这里不重排，避免「看到的顺序」与「存储顺序」不一致。
 */
import PostCard from './PostCard.vue'

defineProps({
  posts: { type: Array, required: true },
  author: { type: Object, default: null },
  highlightId: { type: String, default: null },
  removable: { type: Boolean, default: true },
  emptyTitle: { type: String, default: '还没有动态' },
  emptyHint: { type: String, default: '写下第一条，开始你的记录吧 ✍️' },
  /** 同页存在多个列表时用于区分空状态节点 */
  emptyTestId: { type: String, default: 'empty-state' }
})

const emit = defineEmits(['open', 'remove'])
</script>

<template>
  <div class="post-list">
    <PostCard
      v-for="post in posts"
      :key="post.id"
      :post="post"
      :author="author"
      :highlight="post.id === highlightId"
      :removable="removable"
      @open="emit('open', $event)"
      @remove="emit('remove', $event)"
    />

    <div v-if="posts.length === 0" :data-testid="emptyTestId" class="empty-state">
      <p class="empty-title">{{ emptyTitle }}</p>
      <p class="empty-hint">{{ emptyHint }}</p>
    </div>
  </div>
</template>

<style scoped>
.post-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>

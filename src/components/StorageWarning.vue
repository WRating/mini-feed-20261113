<script setup>
/**
 * 存储告警条。
 * 文案必须说清「数据还能活多久」，而不是笼统地提示"建议用服务器"：
 * session / tab 是刷新不丢，memory 是刷新即丢。
 */
import { computed } from 'vue'

const props = defineProps({
  storageKind: { type: String, default: 'local' }
})

defineEmits(['help'])

const NOTICE = {
  session: '⚠️ 浏览器禁用了本地存储，动态暂存在当前标签页：刷新不丢，关闭标签页后会丢失。',
  tab: '⚠️ 浏览器禁用了本地存储，动态暂存在当前标签页：刷新不丢，关闭标签页后会丢失。',
  memory: '⚠️ 浏览器完全禁止了站点数据，动态只存在内存里：刷新或关闭都会丢失。'
}

const visible = computed(() => props.storageKind !== 'local')
const notice = computed(() => NOTICE[props.storageKind] || NOTICE.session)
</script>

<template>
  <div v-if="visible" data-testid="storage-warning" class="storage-warning" role="alert">
    <span data-testid="storage-warning-text" class="storage-warning-text">{{ notice }}</span>
    <button data-testid="help-btn" class="storage-help-btn" type="button" @click="$emit('help')">
      如何解决
    </button>
  </div>
</template>

<style scoped>
.storage-warning {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: var(--warn-bg);
  border: 1px solid var(--warn-border);
  color: var(--warn-text);
  font-size: 0.82rem;
  border-radius: 10px;
  padding: 10px 12px;
  margin-bottom: 14px;
}

.storage-warning-text {
  flex: 1;
  line-height: 1.55;
}

.storage-help-btn {
  flex: none;
  border: 1px solid var(--warn-border);
  background: #fff;
  color: var(--warn-text);
  font-family: inherit;
  font-size: 0.78rem;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 999px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.18s ease;
}

.storage-help-btn:hover {
  background: #ffedd5;
}
</style>

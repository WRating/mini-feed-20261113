<script setup>
/**
 * 服务连接告警条。
 *
 * 从 LocalStorage 换成 HTTP 之后，「本地存储被禁用」这类告警已经没有意义；
 * 真正会让用户卡住的是「连不上后端」——页面拿不到数据、也存不进去。
 * 因此这里除了文案，还要给一个「重试」按钮：
 * 只让用户「看帮助」而不给重试入口，等于逼他刷新整页。
 */
import { computed } from 'vue'

const props = defineProps({
  // 允许父组件按具体错误定制文案（例如区分超时与 404）
  message: { type: String, default: '' }
})

defineEmits(['retry', 'help'])

const DEFAULT_MESSAGE = '无法连接服务端，数据暂时无法读取或保存。'

// 空串也回退默认值，避免渲染成一条没有文字的空白告警条
const notice = computed(() => props.message.trim() || DEFAULT_MESSAGE)
</script>

<template>
  <div data-testid="connection-warning" class="connection-warning" role="alert">
    <span data-testid="connection-warning-text" class="connection-warning-text">{{ notice }}</span>
    <button data-testid="retry-btn" class="connection-btn" type="button" @click="$emit('retry')">
      重试
    </button>
    <button data-testid="help-btn" class="connection-btn" type="button" @click="$emit('help')">
      如何解决
    </button>
  </div>
</template>

<style scoped>
/* 视觉沿用原存储告警条：同一位置、同一语义，不该因为改名而换观感 */
.connection-warning {
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

.connection-warning-text {
  flex: 1;
  line-height: 1.55;
}

.connection-btn {
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

.connection-btn:hover {
  background: #ffedd5;
}
</style>

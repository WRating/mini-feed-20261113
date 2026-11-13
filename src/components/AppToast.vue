<script setup>
/**
 * 轻量提示条。仅负责展示，显示时长由父级的 message 状态控制。
 */
defineProps({
  message: { type: String, default: '' }
})
</script>

<template>
  <div
    data-testid="toast"
    class="toast"
    :class="{ 'is-show': Boolean(message) }"
    role="status"
    aria-live="polite"
  >
    {{ message }}
  </div>
</template>

<style scoped>
.toast {
  position: fixed;
  left: 50%;
  bottom: 28px;
  transform: translate(-50%, 12px);
  background: rgba(31, 41, 55, 0.94);
  color: #fff;
  font-size: 0.82rem;
  padding: 9px 16px;
  border-radius: 999px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.22s ease, transform 0.22s ease;
  z-index: 80;
  max-width: 82vw;
  text-align: center;
}

.toast.is-show {
  opacity: 1;
  transform: translate(-50%, 0);
}
</style>

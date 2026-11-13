<script setup>
/**
 * 顶部视图切换。纯受控组件：选中态由 modelValue 决定，点击只上报。
 */
const props = defineProps({
  tabs: { type: Array, required: true },
  modelValue: { type: String, required: true }
})

const emit = defineEmits(['update:modelValue'])

function select(key) {
  if (key === props.modelValue) return
  emit('update:modelValue', key)
}
</script>

<template>
  <nav class="tabbar" role="tablist">
    <button
      v-for="tab in tabs"
      :key="tab.key"
      :data-testid="`tab-${tab.key}`"
      class="tab"
      :class="{ 'is-active': tab.key === modelValue }"
      type="button"
      role="tab"
      :aria-selected="tab.key === modelValue"
      @click="select(tab.key)"
    >
      {{ tab.label }}
    </button>
  </nav>
</template>

<style scoped>
.tabbar {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-top: 14px;
  background: #eaeefb;
  padding: 4px;
  border-radius: 999px;
  width: fit-content;
  margin-left: auto;
  margin-right: auto;
}

.tab {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.9rem;
  font-family: inherit;
  padding: 7px 22px;
  border-radius: 999px;
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease;
}

.tab:hover {
  color: var(--text);
}

.tab.is-active {
  background: #fff;
  color: var(--accent);
  font-weight: 600;
  box-shadow: 0 1px 4px rgba(17, 24, 39, 0.1);
}
</style>

<script setup>
/**
 * 发布框：只管输入与提交意图，不碰 store。
 * 提交成功后由本组件负责清空草稿，父组件只负责把内容写入数据层。
 */
import { computed, shallowRef, useTemplateRef } from 'vue'
import { MAX_LEN, normalizeText, canPublish } from '@/utils/post'

const props = defineProps({
  disabled: { type: Boolean, default: false },
  initialText: { type: String, default: '' }
})

const emit = defineEmits(['submit'])

const text = shallowRef(props.initialText)
const inputRef = useTemplateRef('input')

/** 剩余 20 字起提醒，让用户对上限有预期 */
const NEAR_LIMIT_THRESHOLD = 20

const length = computed(() => text.value.length)
const publishable = computed(() => canPublish(text.value) && !props.disabled)
const nearLimit = computed(() => length.value >= MAX_LEN - NEAR_LIMIT_THRESHOLD)
const counterText = computed(() => `${length.value} / ${MAX_LEN}`)

function submit() {
  if (!publishable.value) return

  const content = normalizeText(text.value)
  emit('submit', content)

  // 交给父组件落库后即清空，避免重复提交
  text.value = ''
}

function onKeydown(event) {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault()
    submit()
  }
}

function focus() {
  inputRef.value?.focus()
}

defineExpose({ focus })
</script>

<template>
  <section class="composer card">
    <textarea
      ref="input"
      v-model="text"
      data-testid="composer-input"
      class="composer-input"
      :maxlength="MAX_LEN"
      rows="3"
      placeholder="此刻在想什么？（Ctrl + Enter 快速发布）"
      @keydown="onKeydown"
    ></textarea>

    <div class="composer-bar">
      <span
        data-testid="char-counter"
        class="char-counter"
        :class="{ 'is-near-limit': nearLimit }"
      >
        {{ counterText }}
      </span>
      <button
        data-testid="publish-btn"
        class="btn-primary"
        type="button"
        :disabled="!publishable"
        @click="submit"
      >
        发布
      </button>
    </div>
  </section>
</template>

<style scoped>
.composer {
  padding: 14px;
}

.composer-input {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
  font-family: inherit;
  font-size: 0.95rem;
  line-height: 1.6;
  color: var(--text);
  background: #fbfcfe;
  resize: vertical;
  min-height: 76px;
  outline: none;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.composer-input:focus {
  border-color: var(--accent);
  background: #fff;
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.composer-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
}

.char-counter {
  font-size: 0.78rem;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.char-counter.is-near-limit {
  color: var(--danger);
  font-weight: 600;
}
</style>

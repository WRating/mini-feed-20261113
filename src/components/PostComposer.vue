<script setup>
/**
 * 发布框：只管输入与「提交意图」，不碰 store。
 *
 * 发布已经改成 HTTP 请求，可能失败（后端没起、网络断）。
 * 因此这里改成「受控异步」：提交后**不清空**输入框，
 * 由父组件在请求成功后再调用 clear()。
 * 否则一次失败就把用户刚敲的字丢了——这是最不可接受的回归。
 */
import { computed, shallowRef, useTemplateRef } from 'vue'
import { MAX_LEN, normalizeText, canPublish } from '@/utils/post'

const props = defineProps({
  disabled: { type: Boolean, default: false },
  initialText: { type: String, default: '' },
  // 请求进行中：锁住提交入口，避免重复提交同一段内容
  pending: { type: Boolean, default: false }
})

const emit = defineEmits(['submit'])

const text = shallowRef(props.initialText)
const inputRef = useTemplateRef('input')

/** 剩余 20 字起提醒，让用户对上限有预期 */
const NEAR_LIMIT_THRESHOLD = 20

const length = computed(() => text.value.length)
// pending 与 disabled 同等对待：都不允许触发提交
const blocked = computed(() => props.disabled || props.pending)
const publishable = computed(() => canPublish(text.value) && !blocked.value)
const nearLimit = computed(() => length.value >= MAX_LEN - NEAR_LIMIT_THRESHOLD)
const counterText = computed(() => `${length.value} / ${MAX_LEN}`)
const buttonText = computed(() => (props.pending ? '发布中…' : '发布'))

function submit() {
  if (!publishable.value) return

  // 只上报意图：不在这里改 text，清空交给父组件在成功之后做
  emit('submit', normalizeText(text.value))
}

function onKeydown(event) {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault()
    submit()
  }
}

function clear() {
  text.value = ''
}

function focus() {
  inputRef.value?.focus()
}

defineExpose({ clear, focus })
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
        {{ buttonText }}
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

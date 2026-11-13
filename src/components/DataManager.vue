<script setup>
/**
 * 数据管理：存储占用展示 + 备份导出 / 导入 / 清空。
 * 组件只上报意图，实际的文件读写与 store 变更由父级编排。
 * 「清空」是不可逆操作，因此在组件内做一次行内确认。
 */
import { ref, useTemplateRef } from 'vue'

const props = defineProps({
  meter: {
    type: Object,
    default: () => ({ label: '占用 --', barWidth: '0%', level: 'normal', percent: 0 })
  },
  confirmClear: { type: Boolean, default: true }
})

const emit = defineEmits(['export', 'import', 'clear'])

const fileInputRef = useTemplateRef('fileInput')
const confirming = ref(false)

function requestImport() {
  const input = fileInputRef.value
  if (!input) return
  input.value = '' // 允许连续选择同一个文件
  input.click()
}

function onFileChange(event) {
  const file = event.target?.files?.[0]
  if (file) emit('import', file)
}

function askClear() {
  if (!props.confirmClear) {
    emit('clear')
    return
  }
  confirming.value = true
}

function confirmClear() {
  confirming.value = false
  emit('clear')
}

function cancelClear() {
  confirming.value = false
}
</script>

<template>
  <div class="data-card card">
    <div class="data-head">
      <span class="data-title">数据管理</span>
      <span data-testid="storage-text" class="storage-text">{{ meter.label }}</span>
    </div>

    <div
      data-testid="storage-bar"
      class="storage-bar"
      :class="{ 'is-warn': meter.level === 'warn', 'is-full': meter.level === 'danger' }"
      role="progressbar"
      aria-label="本地存储占用"
      :aria-valuenow="Math.round(meter.percent)"
      aria-valuemin="0"
      aria-valuemax="100"
    >
      <span
        data-testid="storage-fill"
        class="storage-fill"
        :style="{ width: meter.barWidth }"
      ></span>
    </div>

    <div class="data-actions">
      <button data-testid="export-btn" class="btn-ghost" type="button" @click="emit('export')">
        导出备份
      </button>
      <button data-testid="import-btn" class="btn-ghost" type="button" @click="requestImport">
        导入备份
      </button>
      <button data-testid="clear-btn" class="btn-danger" type="button" @click="askClear">
        清空数据
      </button>
    </div>

    <div v-if="confirming" data-testid="clear-confirm" class="clear-confirm" role="alert">
      <p class="clear-confirm-text">将删除全部动态与个人资料，且无法恢复。确定继续？</p>
      <div class="clear-confirm-actions">
        <button data-testid="clear-cancel-btn" class="btn-ghost btn-sm" type="button" @click="cancelClear">
          取消
        </button>
        <button data-testid="clear-confirm-btn" class="btn-danger btn-sm" type="button" @click="confirmClear">
          确认清空
        </button>
      </div>
    </div>

    <p class="data-hint">导出为 JSON 文件；导入采用合并方式，不会覆盖已有动态。</p>

    <input
      ref="fileInput"
      data-testid="import-file"
      class="hidden-input"
      type="file"
      accept="application/json,.json"
      hidden
      @change="onFileChange"
    >
  </div>
</template>

<style scoped>
.data-card {
  padding: 16px;
  margin-top: 14px;
}

.data-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.data-title {
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--text);
}

.storage-text {
  font-size: 0.76rem;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.storage-bar {
  height: 6px;
  border-radius: 999px;
  background: #eef0f5;
  overflow: hidden;
  margin: 10px 0 14px;
}

.storage-fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--accent);
  transition: width 0.25s ease, background 0.25s ease;
}

.storage-bar.is-warn .storage-fill {
  background: #f59e0b;
}

.storage-bar.is-full .storage-fill {
  background: var(--danger);
}

.data-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.clear-confirm {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #fef2f2;
  border: 1px solid #fecaca;
}

.clear-confirm-text {
  font-size: 0.8rem;
  color: #991b1b;
}

.clear-confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}

.btn-sm {
  font-size: 0.78rem;
  padding: 5px 12px;
}

.data-hint {
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-top: 10px;
}

.hidden-input {
  display: none;
}
</style>

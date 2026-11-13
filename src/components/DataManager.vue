<script setup>
/**
 * 数据管理：服务端数据概览 + 备份导出 / 导入 / 清空。
 * 组件只上报意图，实际的文件读写与 store 变更由父级编排。
 * 「清空」是不可逆操作，因此在组件内做一次行内确认。
 *
 * 后端是内存存储，没有浏览器那 5MB 配额，所以这里不再画占用进度条：
 * 画了会让用户以为数据「快满了」，属于误导。
 * 真正需要提醒的是相反的事实——进程一重启数据就没了，要定期导出。
 */
import { computed, ref, useTemplateRef } from 'vue'

const props = defineProps({
  stats: {
    type: Object,
    default: () => ({ posts: 0, chars: 0, bytes: 0, likes: 0, favorites: 0, formatted: '0 B' })
  },
  confirmClear: { type: Boolean, default: true }
})

const emit = defineEmits(['export', 'import', 'clear'])

const fileInputRef = useTemplateRef('fileInput')
const confirming = ref(false)

/**
 * 由后端 /api/stats 提供，字节数直接用服务端算好的 formatted，前端不重复换算。
 * 互动数缺失时按 0：后端尚未升级到带互动的版本时这一行仍要能正常显示。
 */
const statsText = computed(() => {
  const { posts = 0, chars = 0, likes = 0, favorites = 0, formatted = '0 B' } = props.stats || {}
  return `服务端数据 · ${posts} 条动态 · ${chars} 字 · ${likes} 赞 · ${favorites} 收藏 · ${formatted}`
})

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
      <span data-testid="storage-text" class="storage-text">{{ statsText }}</span>
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
      <!-- 后端 DELETE /api/posts 只清动态、保留个人资料，文案必须与契约一致 -->
      <p class="clear-confirm-text">将删除全部动态（保留个人资料），且无法恢复。确定继续？</p>
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

    <p data-testid="memory-hint" class="data-hint data-hint-warn">
      数据存在服务端内存中，服务重启会清空，建议定期导出备份。
    </p>

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
  margin-bottom: 14px;
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

.data-hint-warn {
  color: var(--warn-text);
  line-height: 1.6;
}

.hidden-input {
  display: none;
}
</style>

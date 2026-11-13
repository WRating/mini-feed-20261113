<script setup>
/**
 * 存储问题自助排查面板。
 *
 * 按场景裁剪：只有 file:// 打开时才需要「起服务器」两步；
 * 若页面已经是 http:// 却仍被拦，多半是浏览器设置问题，
 * 此时隐藏服务器步骤并换个标题，避免给出无用指引。
 */
import { computed } from 'vue'

const props = defineProps({
  storageKind: { type: String, default: 'session' },
  isFileProtocol: { type: Boolean, default: false },
  command: { type: String, default: '' }
})

defineEmits(['close', 'copy'])

const REASON = {
  session:
    'Local Storage 被浏览器拒绝（常见于 file:// 直接打开、或限制了站点数据）。改用本地服务器访问即可恢复正常保存。',
  tab: 'Local Storage 与 Session Storage 都被拒绝，当前退到标签页级容器。改用本地服务器访问即可恢复正常保存。',
  memory:
    '浏览器拒绝了所有站点数据写入。除了改用本地服务器访问，还需检查是否开启了「阻止所有 Cookie」或处于无痕模式。'
}

const title = computed(() =>
  props.isFileProtocol ? '让数据保存下来' : '浏览器阻止了数据保存'
)

const reason = computed(() => {
  if (props.isFileProtocol) return REASON[props.storageKind] || REASON.session
  if (props.storageKind === 'memory') return REASON.memory
  return '页面已经通过 http:// 正常访问，但浏览器仍然拒绝了站点数据写入，通常是隐私设置、无痕模式或防护类扩展导致。'
})
</script>

<template>
  <div
    data-testid="help-dialog"
    class="modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="storage-help-title"
  >
    <div data-testid="help-mask" class="modal-mask" @click="$emit('close')"></div>

    <div class="modal-panel">
      <h2 id="storage-help-title" data-testid="help-title" class="modal-title">{{ title }}</h2>
      <p data-testid="help-reason" class="modal-sub">{{ reason }}</p>

      <ol class="help-list">
        <li
          v-if="isFileProtocol"
          data-testid="step-server"
          class="help-step"
        >
          <span data-testid="step-index" class="help-index">1</span>
          <div class="help-body">
            <p class="help-title">双击项目里的 <code>start.bat</code>（Windows）</p>
            <p class="help-desc">
              脚本会自动启动本地服务器并打开浏览器，之后数据就能正常保存。macOS / Linux 用
              <code>./start.sh</code>。
            </p>
          </div>
        </li>

        <li
          v-if="isFileProtocol"
          data-testid="step-server"
          class="help-step"
        >
          <span data-testid="step-index" class="help-index">2</span>
          <div class="help-body">
            <p class="help-title">或者手动起一个本地服务器</p>
            <pre class="help-code"><code data-testid="help-command">{{ command }}</code></pre>
            <p class="help-desc">
              然后在浏览器打开 <code>http://127.0.0.1:8000</code>（不要用 <code>file://</code> 打开）。
            </p>
            <button data-testid="copy-btn" class="btn-ghost btn-sm" type="button" @click="$emit('copy')">
              复制命令
            </button>
          </div>
        </li>

        <li class="help-step">
          <span data-testid="step-index" class="help-index">{{ isFileProtocol ? 3 : 1 }}</span>
          <div class="help-body">
            <p class="help-title">检查浏览器设置</p>
            <p class="help-desc">
              Chrome / Edge → 设置 → 隐私和安全 → 网站设置 → Cookie 和网站数据，不要选「阻止所有」；
              同时请用普通窗口（不是无痕 / InPrivate）。
            </p>
          </div>
        </li>

        <li class="help-step">
          <span data-testid="step-index" class="help-index">{{ isFileProtocol ? 4 : 2 }}</span>
          <div class="help-body">
            <p class="help-title">先备份当前数据</p>
            <p class="help-desc">
              本次会话里写的内容仍可抢救：个人中心 → 数据管理 → 导出备份，改到新地址后再导入。
            </p>
          </div>
        </li>
      </ol>

      <div class="form-actions">
        <button data-testid="help-close-btn" class="btn-primary" type="button" @click="$emit('close')">
          知道了
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
}

.modal-mask {
  position: absolute;
  inset: 0;
  background: rgba(17, 24, 39, 0.45);
}

.modal-panel {
  position: relative;
  width: 100%;
  max-width: 520px;
  max-height: 86vh;
  overflow-y: auto;
  background: var(--card-bg);
  border-radius: 16px;
  padding: 22px 22px 18px;
  box-shadow: 0 18px 50px rgba(17, 24, 39, 0.22);
}

.modal-title {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text);
}

.modal-sub {
  font-size: 0.84rem;
  color: var(--text-secondary);
  margin: 6px 0 16px;
  line-height: 1.6;
}

.help-list {
  list-style: none;
}

.help-step {
  display: flex;
  gap: 10px;
  padding: 12px 0;
  border-top: 1px dashed var(--border);
}

.help-index {
  flex: none;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 0.76rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 2px;
}

.help-body {
  flex: 1;
  min-width: 0;
}

.help-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text);
}

.help-desc {
  font-size: 0.8rem;
  color: var(--text-secondary);
  margin-top: 4px;
  line-height: 1.6;
}

.help-code {
  background: #f3f4f6;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 9px 11px;
  margin: 8px 0 6px;
  overflow-x: auto;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 0.76rem;
  color: #374151;
  white-space: pre;
}

.btn-sm {
  font-size: 0.78rem;
  padding: 5px 12px;
}

code {
  background: #f3f4f6;
  border-radius: 4px;
  padding: 1px 5px;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 0.86em;
  color: #374151;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}
</style>

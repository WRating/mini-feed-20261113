<script setup>
/**
 * 服务启动自助排查面板。
 *
 * 内容从「本地存储被禁怎么办」改成「后端没起来怎么办」。
 * 步骤刻意排成「启动 → 只启动后端 → 健康检查 → 排查端口/防火墙」，
 * 因为健康检查是最快的判据：第 3 步能返回 JSON，就说明前面两步对了，
 * 用户不用去猜日志。
 */
defineProps({
  // 由父组件给出本项目的启动命令，避免把具体脚本名写死在文案里
  command: { type: String, default: 'npm run dev' }
})

defineEmits(['close', 'copy'])
</script>

<template>
  <div
    data-testid="help-dialog"
    class="modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="connection-help-title"
  >
    <div data-testid="help-mask" class="modal-mask" @click="$emit('close')"></div>

    <div class="modal-panel">
      <h2 id="connection-help-title" data-testid="help-title" class="modal-title">连接不上后端服务</h2>
      <p data-testid="help-reason" class="modal-sub">
        页面需要后端提供数据，但后端进程没有响应。多数情况是后端还没启动，或启动在别的端口上。
      </p>

      <ol class="help-list">
        <li class="help-step">
          <span data-testid="step-index" class="help-index">1</span>
          <div class="help-body">
            <p class="help-title">在项目目录执行启动命令</p>
            <pre class="help-code"><code data-testid="help-command">{{ command }}</code></pre>
            <p class="help-desc">
              该命令会同时启动后端与前端。命令必须在项目根目录下执行，否则会找不到脚本。
            </p>
            <button data-testid="copy-btn" class="btn-ghost btn-sm" type="button" @click="$emit('copy')">
              复制命令
            </button>
          </div>
        </li>

        <li class="help-step">
          <span data-testid="step-index" class="help-index">2</span>
          <div class="help-body">
            <p class="help-title">或者只启动后端</p>
            <pre class="help-code"><code>npm run start:server</code></pre>
            <p class="help-desc">
              后端默认监听 <code>8787</code> 端口，可用 <code>PORT</code> 环境变量覆盖。
              前端已经在前端开发服务器上跑着时，用这个方式更省事。
            </p>
          </div>
        </li>

        <li class="help-step">
          <span data-testid="step-index" class="help-index">3</span>
          <div class="help-body">
            <p class="help-title">确认健康检查能返回 JSON</p>
            <p class="help-desc">
              在浏览器打开 <code>http://127.0.0.1:8787/api/health</code>，
              能看到 <code>{"ok": true}</code> 就说明后端已经正常工作。
            </p>
          </div>
        </li>

        <li class="help-step">
          <span data-testid="step-index" class="help-index">4</span>
          <div class="help-body">
            <p class="help-title">排查端口占用与防火墙</p>
            <p class="help-desc">
              若健康检查打不开，先确认 <code>8787</code> 端口没有被别的程序占用，
              再检查系统防火墙或安全软件是否拦截了本地回环连接。
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

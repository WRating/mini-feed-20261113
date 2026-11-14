<script setup>
/**
 * 今日心情卡片 —— 取代原来的天气卡片。
 *
 * 为什么换掉天气：天气依赖 IP 定位与第三方接口，在受限网络下会长期显示
 * 「暂不可用」，等于常驻一块无效信息。心情完全本地可控，不需要任何外部依赖，
 * 也就不会出现「不可用」状态。
 *
 * 组件边界：只展示 + 上报意图（emit select），不直接改 store；
 * 保存中的禁用状态由父级通过 pending 传入。
 * 时钟仍由组件内部驱动（每秒一次），与数据写入完全解耦。
 */
import { computed } from 'vue'
import { useClock } from '@/composables/useClock'
import { MOODS } from '@shared/constants'
import { moodView } from '@shared/mood'

const props = defineProps({
  /** 当前心情键 */
  mood: { type: String, default: '' },
  /** 可选心情列表；不传则用共享白名单，保证组件能独立使用 */
  moods: { type: Array, default: () => MOODS },
  /** 保存中：禁用选项，避免重复请求 */
  pending: { type: Boolean, default: false }
})

const emit = defineEmits(['select'])

const { formatted: clockText } = useClock()

/**
 * 展示用的心情信息。
 * 这里用共享的 moodView 而非直接查 moods —— 它对非法/缺失输入有兜底，
 * 卡片永远不会渲染出空表情。选项列表则用 props.moods（可能是调用方裁剪过的）。
 */
const current = computed(() => moodView(props.mood))

const options = computed(() => (Array.isArray(props.moods) ? props.moods : []))

function select(key) {
  // 保存中忽略点击：由组件自己挡住，避免父级还要到处判断 pending
  if (props.pending) return
  emit('select', key)
}
</script>

<template>
  <section class="mood-card card">
    <div class="mood-main">
      <span data-testid="mood-emoji" class="mood-emoji" aria-hidden="true">
        {{ current.emoji }}
      </span>
      <div class="mood-info">
        <p class="mood-title">今日心情</p>
        <p data-testid="mood-label" class="mood-label">{{ current.label }}</p>
      </div>
    </div>

    <div class="mood-right">
      <p data-testid="mood-time" class="mood-time">{{ clockText }}</p>
    </div>

    <div class="mood-picker" role="group" aria-label="选择今日心情">
      <button
        v-for="option in options"
        :key="option.key"
        data-testid="mood-option"
        class="mood-option"
        :class="{ 'is-active': option.key === current.key }"
        type="button"
        :aria-pressed="option.key === current.key"
        :aria-label="option.label"
        :title="option.label"
        :disabled="pending"
        @click="select(option.key)"
      >
        {{ option.emoji }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.mood-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  position: relative;
  background: linear-gradient(135deg, #eef1ff 0%, #f8f9ff 100%);
  border-color: #dfe3ff;
}

.mood-main {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
}

.mood-emoji {
  font-size: 2rem;
  line-height: 1;
}

.mood-info {
  display: flex;
  flex-direction: column;
}

.mood-title {
  font-size: 0.72rem;
  color: var(--text-secondary);
}

.mood-label {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text);
  line-height: 1.2;
}

.mood-right {
  flex: 1;
  min-width: 0;
  text-align: right;
}

.mood-time {
  font-size: 0.78rem;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.mood-picker {
  flex: none;
  display: flex;
  gap: 4px;
}

.mood-option {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 1px solid transparent;
  background: transparent;
  font-size: 1.05rem;
  line-height: 1;
  cursor: pointer;
  transition: background 0.18s ease, border-color 0.18s ease, transform 0.12s ease;
}

.mood-option:hover:not(:disabled) {
  background: #fff;
  transform: translateY(-1px);
}

.mood-option.is-active {
  background: #fff;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.mood-option:disabled {
  cursor: default;
  opacity: 0.55;
}

@media (max-width: 420px) {
  .mood-card {
    flex-wrap: wrap;
    align-items: flex-start;
  }

  .mood-right {
    flex: 1 1 auto;
  }

  /* 移动端把心情选择器换到第二行，避免与时间挤在一起 */
  .mood-picker {
    width: 100%;
    justify-content: space-between;
    margin-top: 2px;
  }

  .mood-option {
    width: 34px;
    height: 34px;
  }
}
</style>

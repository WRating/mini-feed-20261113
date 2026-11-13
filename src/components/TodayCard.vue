<script setup>
/**
 * 今日卡片：所在地 + 实时时间 + 天气。
 * 只接收展示所需的数据与 loading，刷新以事件上报。
 * 时间由组件内部时钟驱动（每秒一次），与数据请求解耦。
 */
import { computed } from 'vue'
import { useClock } from '@/composables/useClock'

const props = defineProps({
  place: { type: String, default: '定位中…' },
  weather: { type: Object, default: null },
  detailText: { type: String, default: '' },
  loading: { type: Boolean, default: false }
})

const emit = defineEmits(['refresh'])

const { formatted: clockText } = useClock()

const tempText = computed(() => (props.weather ? `${props.weather.temp}°` : '--°'))
const descText = computed(() => props.weather?.label || '天气暂不可用')
const iconText = computed(() => props.weather?.icon || '🌤️')
</script>

<template>
  <section class="today-card card">
    <div class="weather-left">
      <span data-testid="weather-icon" class="weather-icon" aria-hidden="true">{{ iconText }}</span>
      <div class="weather-info">
        <p data-testid="weather-temp" class="weather-temp">{{ tempText }}</p>
        <p data-testid="weather-desc" class="weather-desc">{{ descText }}</p>
      </div>
    </div>

    <div class="weather-right">
      <p data-testid="weather-location" class="weather-location">📍 {{ place }}</p>
      <p data-testid="weather-time" class="weather-time">{{ clockText }}</p>
      <p v-if="detailText" data-testid="weather-detail" class="weather-detail">{{ detailText }}</p>
    </div>

    <button
      data-testid="refresh-btn"
      class="weather-refresh"
      :class="{ 'is-loading': loading }"
      type="button"
      title="刷新天气"
      aria-label="刷新天气"
      :disabled="loading"
      @click="emit('refresh')"
    >
      ⟳
    </button>
  </section>
</template>

<style scoped>
.today-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  position: relative;
  background: linear-gradient(135deg, #eef1ff 0%, #f8f9ff 100%);
  border-color: #dfe3ff;
}

.weather-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
}

.weather-icon {
  font-size: 2rem;
  line-height: 1;
}

.weather-info {
  display: flex;
  flex-direction: column;
}

.weather-temp {
  font-size: 1.55rem;
  font-weight: 700;
  color: var(--text);
  line-height: 1.15;
  font-variant-numeric: tabular-nums;
}

.weather-desc {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.weather-right {
  flex: 1;
  min-width: 0;
  text-align: right;
}

.weather-location {
  font-size: 0.83rem;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.weather-time {
  font-size: 0.78rem;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.weather-detail {
  font-size: 0.72rem;
  color: var(--text-secondary);
  margin-top: 1px;
}

.weather-refresh {
  flex: none;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 1px solid #dfe3ff;
  background: #fff;
  color: var(--accent);
  font-size: 0.95rem;
  cursor: pointer;
  transition: background 0.18s ease;
}

.weather-refresh:hover:not(:disabled) {
  background: var(--accent-soft);
}

.weather-refresh:disabled {
  cursor: default;
  opacity: 0.5;
}

.weather-refresh.is-loading {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 420px) {
  .today-card {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .weather-right {
    flex: 1 1 auto;
  }

  .weather-refresh {
    position: absolute;
    top: 10px;
    right: 12px;
  }
}
</style>

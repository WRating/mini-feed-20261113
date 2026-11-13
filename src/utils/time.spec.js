/**
 * 时间工具测试（TDD）
 * 纯函数，不依赖 Vue，覆盖相对时间 / 精确时间 / 时钟 / 使用天数四组契约。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  formatRelativeTime,
  formatExactTime,
  formatClock,
  formatDayLabel,
  daysSince
} from './time'

// 固定"现在"为 2026-11-13 10:00:00（本地时区），让相对时间断言稳定
const NOW = new Date(2026, 10, 13, 10, 0, 0).getTime()

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('formatRelativeTime', () => {
  it('一分钟以内显示「刚刚」', () => {
    expect(formatRelativeTime(NOW, NOW)).toBe('刚刚')
    expect(formatRelativeTime(NOW - 59_000, NOW)).toBe('刚刚')
  })

  it('一小时以内显示 N 分钟前', () => {
    expect(formatRelativeTime(NOW - 60_000, NOW)).toBe('1 分钟前')
    expect(formatRelativeTime(NOW - 45 * 60_000, NOW)).toBe('45 分钟前')
    expect(formatRelativeTime(NOW - 59 * 60_000, NOW)).toBe('59 分钟前')
  })

  it('一天以内显示 N 小时前', () => {
    expect(formatRelativeTime(NOW - 60 * 60_000, NOW)).toBe('1 小时前')
    expect(formatRelativeTime(NOW - 23 * 3600_000, NOW)).toBe('23 小时前')
  })

  it('超过一天但在本周内显示 N 天前', () => {
    expect(formatRelativeTime(NOW - 24 * 3600_000, NOW)).toBe('1 天前')
    expect(formatRelativeTime(NOW - 6 * 24 * 3600_000, NOW)).toBe('6 天前')
  })

  it('超过 7 天回退为具体日期', () => {
    const old = new Date(2026, 10, 1, 9, 0, 0).getTime()
    expect(formatRelativeTime(old, NOW)).toBe('11月1日')
  })

  it('跨年时带上年份', () => {
    const lastYear = new Date(2025, 10, 1, 9, 0, 0).getTime()
    expect(formatRelativeTime(lastYear, NOW)).toBe('2025年11月1日')
  })

  it('时间戳在未来（时钟漂移）时按「刚刚」处理，不出现负数', () => {
    expect(formatRelativeTime(NOW + 10_000, NOW)).toBe('刚刚')
  })
})

describe('formatExactTime', () => {
  it('输出「YYYY-MM-DD HH:mm」', () => {
    const t = new Date(2026, 10, 13, 9, 5, 0).getTime()
    expect(formatExactTime(t)).toBe('2026-11-13 09:05')
  })
})

describe('formatClock', () => {
  it('输出「M月D日 周X HH:mm:ss」，时分秒补零', () => {
    const t = new Date(2026, 10, 13, 9, 5, 7).getTime()
    expect(formatClock(t)).toBe('11月13日 周五 09:05:07')
  })

  it('星期日显示为周日', () => {
    const sunday = new Date(2026, 10, 15, 0, 0, 0).getTime()
    expect(formatClock(sunday)).toBe('11月15日 周日 00:00:00')
  })
})

describe('formatDayLabel', () => {
  it('今天 / 昨天 / 前天使用相对说法', () => {
    expect(formatDayLabel(NOW, NOW)).toBe('今天')
    expect(formatDayLabel(new Date(2026, 10, 12, 8, 0).getTime(), NOW)).toBe('昨天')
    expect(formatDayLabel(new Date(2026, 10, 11, 8, 0).getTime(), NOW)).toBe('前天')
  })

  it('更早显示 M月D日', () => {
    expect(formatDayLabel(new Date(2026, 10, 8, 8, 0).getTime(), NOW)).toBe('11月8日')
  })
})

describe('daysSince', () => {
  it('同一天算第 1 天', () => {
    expect(daysSince(NOW, NOW)).toBe(1)
  })

  it('跨一天算第 2 天', () => {
    const yesterday = new Date(2026, 10, 12, 22, 0).getTime()
    expect(daysSince(yesterday, NOW)).toBe(2)
  })

  it('按自然日计算，不受具体时刻影响', () => {
    const earlyToday = new Date(2026, 10, 13, 0, 1).getTime()
    expect(daysSince(earlyToday, NOW)).toBe(1)
  })

  it('是未来时间时至少返回 1，不出现 0 或负数', () => {
    expect(daysSince(NOW + 86_400_000, NOW)).toBe(1)
  })
})

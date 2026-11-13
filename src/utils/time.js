/**
 * 时间格式化 —— 纯函数集合。
 * now 一律作为参数传入（默认取当前时间），便于测试与复用。
 */

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

const pad = (n) => String(n).padStart(2, '0')

/** 判断两个时间戳是否落在同一个自然日 */
function isSameDay(a, b) {
  const da = new Date(a)
  const db = new Date(b)
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  )
}

/**
 * 相对时间：刚刚 / N 分钟前 / N 小时前 / N 天前 / 具体日期
 * 未来时间（时钟漂移）统一按「刚刚」处理，避免出现负数。
 */
export function formatRelativeTime(timestamp, now = Date.now()) {
  const diff = now - timestamp
  if (diff < MINUTE) return '刚刚'
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} 分钟前`
  if (diff < DAY) return `${Math.floor(diff / HOUR)} 小时前`
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)} 天前`
  return formatDayLabel(timestamp, now)
}

/** 精确时间：YYYY-MM-DD HH:mm */
export function formatExactTime(timestamp) {
  const d = new Date(timestamp)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 时钟：M月D日 周X HH:mm:ss（秒级实时刷新用） */
export function formatClock(timestamp) {
  const d = new Date(timestamp)
  return `${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAYS[d.getDay()]} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** 日期标签：今天 / 昨天 / 前天 / M月D日 / YYYY年M月D日（跨年） */
export function formatDayLabel(timestamp, now = Date.now()) {
  const target = new Date(timestamp)
  const today = new Date(now)

  if (isSameDay(timestamp, now)) return '今天'

  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1).getTime()
  if (isSameDay(timestamp, yesterday)) return '昨天'

  const beforeYesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 2).getTime()
  if (isSameDay(timestamp, beforeYesterday)) return '前天'

  const sameYear = target.getFullYear() === today.getFullYear()
  const monthDay = `${target.getMonth() + 1}月${target.getDate()}日`
  return sameYear ? monthDay : `${target.getFullYear()}年${monthDay}`
}

/**
 * 从起始时间到现在的使用天数（含首日）。
 * 按自然日计算，未来时间至少返回 1。
 */
export function daysSince(startTimestamp, now = Date.now()) {
  if (!Number.isFinite(startTimestamp)) return 1
  const start = new Date(startTimestamp)
  const today = new Date(now)
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime()
  const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const diffDays = Math.round((todayDay - startDay) / DAY)
  return Math.max(1, diffDays + 1)
}

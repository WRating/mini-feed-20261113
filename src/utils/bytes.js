/**
 * 字节数格式化 —— 纯函数。
 */
const KB = 1024
const MB = KB * KB

export function formatBytes(bytes) {
  const value = Number(bytes)
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  if (value < KB) return `${Math.round(value)} B`
  if (value < MB) return `${(value / KB).toFixed(1)} KB`
  return `${(value / MB).toFixed(2)} MB`
}

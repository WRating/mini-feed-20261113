/**
 * 字节格式化测试（TDD）
 */
import { describe, it, expect } from 'vitest'
import { formatBytes } from './bytes'

describe('formatBytes', () => {
  it('0 与负数按 0 B 处理', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(-10)).toBe('0 B')
  })

  it('小于 1 KB 显示 B（整数）', () => {
    expect(formatBytes(1)).toBe('1 B')
    expect(formatBytes(999)).toBe('999 B')
  })

  it('KB 保留一位小数', () => {
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
  })

  it('MB 保留两位小数', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.00 MB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.00 MB')
  })

  it('非法输入不抛错', () => {
    expect(formatBytes(undefined)).toBe('0 B')
    expect(formatBytes(NaN)).toBe('0 B')
  })
})

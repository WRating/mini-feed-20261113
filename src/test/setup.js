/**
 * 测试环境全局准备。
 * happy-dom 自带 localStorage / sessionStorage，但未实现 confirm，
 * 这里补一个可被 spy 的默认实现（浏览器中始终存在）。
 */
import { afterEach, beforeEach, vi } from 'vitest'

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  window.name = ''
  // 默认为「用户点了确定」，单个用例可用 mockReturnValue 改
  window.confirm = vi.fn(() => true)
})

afterEach(() => {
  vi.useRealTimers()
})

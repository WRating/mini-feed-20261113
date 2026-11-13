/**
 * 应用级单例：存储实例。
 *
 * store 不直接 new storage，而是通过这里取，好处是测试里可以整体替换成
 * 一个受控实例（或内存实例），无需 mock 全局 window.localStorage。
 */
import { createStorage } from './storage'

let current = null

/** 获取（惰性创建）应用存储实例 */
export function useStorage() {
  if (!current) current = createStorage()
  return current
}

/** 替换存储实例；传 null 表示重置为默认（测试用） */
export function setStorage(next) {
  current = next
}

/**
 * 存储层：把「浏览器可能不给用存储」这件事封装在一个地方。
 *
 * 降级顺序：localStorage → sessionStorage → window.name → 内存
 * - local  ：正常情况，数据跨会话保留
 * - session：两种 Storage 之一可用（多为 localStorage 被策略拒绝），刷新不丢、关标签页丢
 * - tab    ：两种 Storage 都被拒，退到标签页级容器，刷新不丢、关标签页丢
 * - memory ：连 window.name 都写不了，仅当前页面有效
 *
 * 所有读写都不允许抛异常：UI 的发布链路绝不能因为存储问题中断。
 *
 * 注：storage-shim 会把被策略拦截的存储替换为内存替身（避免第三方库崩），
 * 替身不代表真实持久化，因此这里通过 isShim 识别并跳过，如实降级。
 */

import { isShim } from './storage-shim'

export const PREFIX = 'minifeed.'
export const NAME_MARK = '__MINIFEED_STORE__:'

/** 依次尝试取出可用的 Storage 对象，取不到返回 null（访问本身可能抛错） */
function grabArea(label) {
  try {
    return window[label] || null
  } catch {
    return null
  }
}

/** 试写一个探针键，确认这个 Storage 真的能写（隐私模式下可能存在但不可写） */
function canUse(area) {
  if (!area) return false
  // shim 内存替身可用但不是持久化，交由调用方按「不可持久化」处理
  try {
    const probe = `${PREFIX}__probe__`
    area.setItem(probe, '1')
    area.removeItem(probe)
    return true
  } catch {
    return false
  }
}

/** 判断是否为浏览器原生存储（而非 shim 替身） */
function isNative(area) {
  return Boolean(area) && !isShim(area)
}

/** window.name 不受「阻止站点数据」策略限制，可作为标签页级兜底容器 */
function readNameStore() {
  try {
    const raw = window.name || ''
    if (raw.startsWith(NAME_MARK)) {
      const parsed = JSON.parse(raw.slice(NAME_MARK.length))
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed
      }
    }
  } catch {
    // window.name 内容不是自己的数据或已损坏，按空处理
  }
  return {}
}

function writeNameStore(map) {
  try {
    window.name = NAME_MARK + JSON.stringify(map)
    return true
  } catch {
    return false
  }
}

/**
 * 创建一个存储实例。
 * kind 在创建时确定一次；若运行中某个 Storage 被回收，读写会自动兜底而不改变 kind。
 */
export function createStorage() {
  const local = grabArea('localStorage')
  const memory = new Map()

  let kind = 'memory'
  let area = null

  if (isNative(local) && canUse(local)) {
    kind = 'local'
    area = local
  } else {
    const session = grabArea('sessionStorage')
    if (isNative(session) && canUse(session)) {
      kind = 'session'
      area = session
    } else {
      // 退到标签页级容器：先把已有数据读进内存，保证同一会话内可继续累积
      const restored = readNameStore()
      Object.keys(restored).forEach((key) => memory.set(key, restored[key]))
      kind = writeNameStore(Object.fromEntries(memory)) ? 'tab' : 'memory'
    }
  }

  const persistMemory = () => {
    if (kind === 'tab') writeNameStore(Object.fromEntries(memory))
  }

  const fullKey = (key) => PREFIX + key

  return {
    kind,
    /** 只有 local 才算真正持久化 */
    available: kind === 'local',

    read(key) {
      if (area) {
        try {
          const value = area.getItem(fullKey(key))
          // 存储区没有时继续看内存副本：之前可能因配额/回收而只写进了内存
          if (value !== null) return value
        } catch {
          // 运行中被回收，退回内存副本
        }
      }
      return memory.has(key) ? memory.get(key) : null
    },

    write(key, value) {
      if (area) {
        try {
          area.setItem(fullKey(key), value)
          return
        } catch {
          // 配额满或被回收：写入内存 + window.name，保证后续仍能读回
          memory.set(key, value)
          persistMemory()
          return
        }
      }
      memory.set(key, value)
      persistMemory()
    },

    remove(key) {
      if (area) {
        try {
          area.removeItem(fullKey(key))
        } catch {
          // 删不掉也要保证内存副本清掉，语义上已完成删除
        }
      }
      memory.delete(key)
      persistMemory()
    },

    /** 返回去前缀后的自身键名 */
    keys() {
      const names = []
      if (area) {
        try {
          for (let i = 0; i < area.length; i += 1) {
            const key = area.key(i)
            if (key && key.startsWith(PREFIX)) names.push(key.slice(PREFIX.length))
          }
        } catch {
          return []
        }
      } else {
        memory.forEach((_value, key) => names.push(key))
      }
      return names
    },

    /** 自身键占用的字节数（UTF-16，每字符 2 字节）；内存模式无法估算，返回 0 */
    usage() {
      if (!area) return 0
      let bytes = 0
      try {
        for (let i = 0; i < area.length; i += 1) {
          const key = area.key(i)
          if (!key || !key.startsWith(PREFIX)) continue
          bytes += (key.length + (area.getItem(key) || '').length) * 2
        }
      } catch {
        return 0
      }
      return bytes
    }
  }
}

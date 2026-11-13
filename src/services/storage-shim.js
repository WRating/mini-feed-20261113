/**
 * 存储保护垫片（side-effect 模块）。
 *
 * 背景：某些浏览器策略（file:// 打开、阻止站点数据、无痕模式）会让
 * `window.localStorage` 的**访问器本身抛异常**。此时 `typeof localStorage`
 * 也会抛错，因此任何依赖 `typeof` 做守卫的第三方代码都会崩。
 *
 * 实测受影响的是 Pinia 内置的 vue-devtools-kit：
 *   if (typeof localStorage === "undefined" || localStorage === null) return {...}
 * 它在模块求值阶段就读取 localStorage，异常会让 Pinia 加载失败，
 * 进而导致 Vue 应用完全无法挂载（页面白屏）。
 *
 * 做法：把会抛异常的访问器替换成"可安全读写"的内存实现，并打上标记。
 * 这样第三方库拿到的是一个能用的对象（不会崩），而本应用自己的存储层
 * 通过 SHIM_MARK 识别出它并非真实存储，仍然如实降级并提示用户。
 *
 * ⚠️ 本模块必须在任何第三方库之前导入（见 main.js 的第一行 import）。
 */

/** 标记：由本模块安装的内存替身，用于与浏览器原生存储区分 */
export const SHIM_MARK = '__minifeed_shim__'

/** 安全地取出存储对象；访问器抛错时返回 null */
function grab(label) {
  try {
    return window[label] || null
  } catch {
    return null
  }
}

/** 试写探针键，确认这个存储真的可用 */
function canUse(area) {
  if (!area) return false
  try {
    const probe = '__minifeed_probe__'
    area.setItem(probe, '1')
    area.removeItem(probe)
    return true
  } catch {
    return false
  }
}

/** 是否为本模块安装的替身 */
export function isShim(area) {
  try {
    return Boolean(area && area[SHIM_MARK])
  } catch {
    return false
  }
}

/** 创建一个符合 Storage 接口的内存实现 */
function createMemoryArea() {
  const map = new Map()

  const area = {
    get length() {
      return map.size
    },
    key(index) {
      return Array.from(map.keys())[index] ?? null
    },
    getItem(key) {
      const name = String(key)
      return map.has(name) ? map.get(name) : null
    },
    setItem(key, value) {
      map.set(String(key), String(value))
    },
    removeItem(key) {
      map.delete(String(key))
    },
    clear() {
      map.clear()
    }
  }

  // 标记设为不可枚举，避免影响 Object.keys / 遍历行为
  Object.defineProperty(area, SHIM_MARK, { value: true, enumerable: false })
  return area
}

/**
 * 安装保护垫片并返回原生存储的可用性。
 * 可重复调用：每次都会重新探测，已安装替身时不会重复包裹。
 */
export function installStorageShim() {
  const capability = { local: false, session: false }

  for (const [label, key] of [
    ['localStorage', 'local'],
    ['sessionStorage', 'session']
  ]) {
    const area = grab(label)

    // 已经是我们装的替身，说明原生存储确实不可用
    if (isShim(area)) continue

    if (canUse(area)) {
      capability[key] = true
      continue
    }

    // 原生不可用：换成内存替身，避免第三方库读取时把应用打挂。
    // 替身的创建与安装都放在 try 内 —— 某些环境可能连属性替换都不允许。
    try {
      Object.defineProperty(window, label, {
        configurable: true,
        writable: true,
        value: createMemoryArea()
      })
    } catch {
      // 替换失败（极少数环境），后续读取仍由应用自身的容错兜住
    }
  }

  return capability
}

/** 探测结果缓存，供应用内查询（不改变 window 上的对象） */
let lastCapability = null

/** 取原生存储可用性；未安装过则先安装 */
export function getStorageCapability() {
  if (!lastCapability) lastCapability = installStorageShim()
  return { ...lastCapability }
}

// 模块被导入即生效 —— 这一步必须早于 Pinia / Vue Devtools 的模块求值
lastCapability = installStorageShim()

/**
 * 数据备份编排：把「动态」与「资料」两个 store 的导入导出串成一次操作。
 *
 * 为什么单独放在 composable 而不是塞进 store：
 * 导出/导入天然跨两个领域 store，放在任一 store 里都会让它依赖另一个，
 * 由这个协调者持有流程，两个 store 保持互不知道对方。
 *
 * 后端化后的异步性：导出仍是同步的（只读当前内存状态 + 触发下载），
 * 导入与清空要打接口，因此改为 async，调用方必须 await。
 */
import { usePostsStore } from '@/stores/posts'
import { useProfileStore } from '@/stores/profile'
import { buildBackup, parseBackup } from '@/utils/backup'

const pad = (n) => String(n).padStart(2, '0')

export function useDataBackup() {
  const postsStore = usePostsStore()
  const profileStore = useProfileStore()

  /** 组装备份对象（深拷贝，与 store 状态解耦） */
  function buildPayload() {
    return buildBackup({
      posts: postsStore.posts,
      profile: {
        name: profileStore.name,
        bio: profileStore.bio,
        avatar: profileStore.avatar,
        joinedAt: profileStore.joinedAt
      }
    })
  }

  /** 备份文件名：minifeed-backup-YYYYMMDD-HHmm.json */
  function buildFileName(now = Date.now()) {
    const d = new Date(now)
    return `minifeed-backup-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`
  }

  /**
   * 触发浏览器下载。
   * 返回 { ok, count, fileName } 或 { ok:false, error }，由 UI 决定提示文案。
   */
  function exportBackup() {
    if (typeof Blob !== 'function' || !URL || typeof URL.createObjectURL !== 'function') {
      return { ok: false, error: '当前浏览器不支持导出' }
    }

    const payload = buildPayload()
    const fileName = buildFileName()

    try {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      // 交给浏览器读取后再回收
      setTimeout(() => URL.revokeObjectURL(url), 1000)

      return { ok: true, count: payload.posts.length, fileName }
    } catch (error) {
      return { ok: false, error: error?.message || '导出失败' }
    }
  }

  /**
   * 导入备份内容。合并动态、按规则恢复资料，返回结构化结果供 UI 展示。
   * 解析失败时不触碰任何 store，保证数据不被破坏。
   *
   * 后端化后这是**异步**操作：动态要 POST /api/posts/merge，资料要走
   * POST /api/profile/restore，两者都必须等结果才知道成败。
   */
  async function importBackup(input) {
    const parsed = parseBackup(input)
    if (!parsed.ok) {
      return {
        ok: false,
        error: parsed.error,
        added: 0,
        skipped: 0,
        profileRestored: false
      }
    }

    const { added, skipped } = await postsStore.merge(parsed.posts)

    // 合并失败时不再去动资料：连动态都没导入进去，恢复资料只会让状态更混乱。
    // merge 失败会返回全 0；用 added/skipped 都为 0 且入参非空来判定失败。
    if (added === 0 && skipped === 0 && parsed.posts.length > 0) {
      return {
        ok: false,
        error: postsStore.loadError || '动态导入失败',
        added: 0,
        skipped: 0,
        profileRestored: false
      }
    }

    const profileRestored = await profileStore.restoreFromBackup(parsed.profile)

    return {
      ok: true,
      error: null,
      added,
      skipped: skipped + parsed.skipped,
      profileRestored
    }
  }

  /**
   * 清空全部数据（动态 + 资料），两个 store 一起归零。
   * 两者都是独立的 HTTP 请求，用 allSettled 而非 all：一个失败不该让另一个白做。
   */
  async function clearAll() {
    await Promise.allSettled([postsStore.clear(), profileStore.reset()])
  }

  return { buildPayload, buildFileName, exportBackup, importBackup, clearAll }
}

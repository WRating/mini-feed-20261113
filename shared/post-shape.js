/**
 * 互动状态（点赞 / 收藏）的形状与状态迁移 —— 前后端共用。
 *
 * 为什么放在 shared 而不是各写一份：
 * 「toggle 的语义」「计数与标记不一致时以谁为准」这类规则一旦两端不一致，
 * 就会出现「点一下界面显示已赞、刷新后又变回未赞」这种极难排查的问题。
 * 把状态迁移做成这一份纯函数，两端调用同一份实现。
 *
 * 数据模型说明：
 * - `likes` / `favorites` 是**计数**，作为存储的事实来源
 * - `liked` / `favorited` 是**当前访问者**是否互动过
 *
 * 当前应用没有登录体系，只有一个隐含的"本机用户"，因此计数现实中只会是 0 或 1。
 * 之所以仍把计数与标记分开存，是为了让接口形状在多用户后端下不需要迁移 ——
 * 届时只需把「当前访问者」换成真实用户 id，形状不变。
 */

/** 互动类型白名单校验 —— 用于校验 URL 参数，避免拼错的 kind 静默生效 */
export function isValidKind(kind) {
  return kind === 'like' || kind === 'favorite'
}

/** 把 kind 映射到计数与标记字段名，避免各处散落字符串拼接 */
const FIELD_BY_KIND = {
  like: { count: 'likes', flag: 'liked' },
  favorite: { count: 'favorites', flag: 'favorited' }
}

/**
 * 取非负整数：非法输入（负数、小数、NaN、字符串、Infinity）一律回落 0。
 * 计数来自不可信输入（备份文件、被改过的客户端），不能直接信任。
 */
function toCount(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  const int = Math.floor(value)
  return int > 0 ? int : 0
}

/**
 * 规范化互动状态。
 *
 * 关键规则：**标记与计数必须自洽**。
 * 如果备份里出现 `{ likes: 0, liked: true }`（曾经点赞过、但计数被清掉了），
 * 直接采用会让界面显示"已点赞但 0 人点赞"。这里以标记为准把计数抬到至少 1，
 * 因为用户能直接看到的是那个高亮的心形，它不该与旁边的数字矛盾。
 */
export function normalizeReactions(source) {
  const raw = source && typeof source === 'object' && !Array.isArray(source) ? source : {}

  const result = { likes: 0, favorites: 0, liked: false, favorited: false }

  for (const kind of ['like', 'favorite']) {
    const { count, flag } = FIELD_BY_KIND[kind]
    const active = raw[flag] === true
    const value = toCount(raw[count])

    result[flag] = active
    // 有标记就必须至少计 1；无标记则原样保留计数
    result[count] = active ? Math.max(value, 1) : value
  }

  return result
}

/** 只取一个对象的互动字段（用于从 Post 里抽出互动状态） */
export function pickReactions(post) {
  return normalizeReactions(post)
}

/**
 * 状态迁移：把某个互动设为目标状态。
 * 返回新对象，不修改入参 —— 调用方（store）依赖"返回新对象"来触发响应式更新。
 *
 * 计数同步增减，且保证不会降到 0 以下：重复取消同一个赞不该把计数减成负数。
 */
export function setReaction(current, kind, active) {
  if (!isValidKind(kind)) return normalizeReactions(current)

  const { count, flag } = FIELD_BY_KIND[kind]
  const base = normalizeReactions(current)
  const target = active === true

  // 状态没变化就原样返回，避免产生无意义的更新与无谓的请求
  if (base[flag] === target) return base

  const next = { ...base, [flag]: target }
  next[count] = target ? base[count] + 1 : Math.max(0, base[count] - 1)
  return next
}

/** 状态迁移：在两个状态之间切换 */
export function toggleReaction(current, kind) {
  if (!isValidKind(kind)) return normalizeReactions(current)
  const { flag } = FIELD_BY_KIND[kind]
  const base = normalizeReactions(current)
  return setReaction(base, kind, !base[flag])
}

/**
 * 汇总多条动态的互动数，供统计接口使用。
 * 非法条目直接跳过，保证统计不会因一条脏数据整体失败。
 */
export function sumReactions(posts) {
  const total = { likes: 0, favorites: 0 }

  if (!Array.isArray(posts)) return total

  for (const post of posts) {
    if (!post || typeof post !== 'object') continue
    const { likes, favorites } = normalizeReactions(post)
    total.likes += likes
    total.favorites += favorites
  }

  return total
}

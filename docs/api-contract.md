# Mini Feed API 契约（v1）

> 本文件是**前后端并行开发的唯一依据**。任何一方需要改动，必须先改这里并通知另一方。
> 后端实现：Hono + `@hono/node-server`；存储：**内存**（进程重启即清空）。

## 1. 基本约定

- 基址：`/api`
- 默认端口：`8787`（可用 `PORT` 环境变量覆盖）
- 请求/响应体：`application/json; charset=utf-8`
- 开发期由 Vite 代理 `/api` → `http://127.0.0.1:8787`，前端同源访问，无需处理 CORS；后端仍需开启 CORS 以便独立调试。
- 内存存储：数据不落盘，**重启后端即清空**，这是本版本的既定取舍。

## 2. 数据模型

```ts
type Post = {
  id: string          // 服务端生成，唯一
  text: string        // 已 trim，长度 1..280
  createdAt: number   // 毫秒时间戳
  likes: number       // 点赞数，非负整数
  favorites: number   // 收藏数，非负整数
  liked: boolean      // 当前访问者是否已点赞
  favorited: boolean  // 当前访问者是否已收藏
}
```

互动字段的规范化规则由 `shared/post-shape.js` 定义（前后端共用同一份实现），
要点：非法计数回落 0；**标记为真但计数为 0 时把计数抬到 1**，避免出现
「已点赞但 0 人点赞」这种自相矛盾的界面。

> 说明：当前没有登录体系，只有一个隐含的「本机用户」，因此计数实际只会是 0 或 1。
> 计数与标记分开存是为了将来接真实用户时形状不变。

```ts
type ReactionKind = 'like' | 'favorite'

type MoodKey = 'great' | 'calm' | 'tired' | 'down' | 'fired'

type Profile = {
  name: string        // 已 trim，1..20 字
  bio: string         // 已 trim，0..60 字
  avatar: string      // 必须来自 AVATAR 白名单
  mood: MoodKey       // 今日心情，必须来自 MOODS 白名单，默认 'great'
  joinedAt: number    // 毫秒时间戳，创建资料时确定，之后不可改
}
```

## 3. 统一错误结构

所有 4xx/5xx 一律返回：

```json
{ "error": { "code": "EMPTY", "message": "内容不能为空" } }
```

| code | HTTP | 场景 |
| --- | --- | --- |
| `INVALID` | 400 | 请求体不是对象 / 字段类型错误 |
| `EMPTY` | 400 | 内容为空或纯空白 |
| `TOO_LONG` | 400 | 文本超过 280 字 |
| `INVALID_AVATAR` | 400 | 头像不在白名单 |
| `INVALID_MOOD` | 400 | 心情不在白名单 |
| `NAME_TOO_LONG` | 400 | 昵称超过 20 字（服务端截断后仍超限才报错；正常情况直接截断） |
| `NOT_FOUND` | 404 | 指定 id 的动态不存在 |
| `BAD_JSON` | 400 | 请求体不是合法 JSON |

**服务端是校验的唯一权威**。前端的校验只为即时反馈，不可信任。

## 4. 端点定义

### 4.1 健康检查

```
GET /api/health
200 { "ok": true, "storage": "memory", "uptimeMs": 1234,
      "startedAt": "2026-11-13T07:00:00.000Z", "posts": 3 }
```

- `posts`：当前动态数，便于一眼确认服务状态（无需再拉一次列表）。

### 4.2 统计

```
GET /api/stats
200 { "posts": 3, "chars": 42, "bytes": 812, "likes": 7, "favorites": 2 }
```

- `bytes`：以 UTF-8 计算 `JSON.stringify({posts, profile})` 的字节数，用于前端展示「服务端数据量」。
- `likes` / `favorites`：全部动态的互动数之和（用于个人中心的累计展示）。

### 4.3 动态列表

```
GET /api/posts
200 { "posts": [ { "id": "...", "text": "...", "createdAt": 1794534951738,
                   "likes": 1, "favorites": 0, "liked": true, "favorited": false } ] }
```

- 按 `createdAt` **倒序**（新的在前）。
- 无数据时返回 `{ "posts": [] }`（不是 404）。
- 每条都带完整的互动字段（旧数据缺失时补 0 / false）。

### 4.4 发布

```
POST /api/posts
body { "text": "  内容  " }
201 { "post": { "id": "...", "text": "内容", "createdAt": 1794534951738,
                "likes": 0, "favorites": 0, "liked": false, "favorited": false } }
400 { "error": { "code": "EMPTY", "message": "内容不能为空" } }
400 { "error": { "code": "TOO_LONG", "message": "内容不能超过 280 字" } }
```

- 服务端负责 `trim`；trim 后为空 → `EMPTY`。
- `id` 由服务端生成，客户端**不得**指定。
- 新动态的互动字段全为 0 / false。

### 4.5 单条查询

```
GET /api/posts/:id
200 { "post": { ... } }
404 { "error": { "code": "NOT_FOUND", "message": "动态不存在" } }
```

### 4.6 删除

```
DELETE /api/posts/:id
204 （无响应体）
404 { "error": { "code": "NOT_FOUND", "message": "动态不存在" } }
```

### 4.7 合并导入

```
POST /api/posts/merge
body { "posts": [ { "id": "...", "text": "...", "createdAt": 1794534951738 } ] }
200 { "added": 2, "skipped": 1, "posts": [ ...合并后的完整倒序列表... ] }
```

- 去重键：`text + '\u0000' + createdAt`（即「内容 + 时间」相同视为重复）。
- 非法条目（缺 `text` / `createdAt` 非有限数 / text 为空）计入 `skipped`，不报错。
- 超长文本**截断**到 280 而非丢弃。
- 缺失 `id` 时服务端补一个。
- 一并返回合并后的完整列表，前端可省一次 `GET`。
- 每条可以**带上互动字段**（`likes`/`favorites`/`liked`/`favorited`）；缺失按 0 / false。
- 导入的互动状态以备份为准（**目标状态**语义，不是叠加），
  因此同一份备份导入两次得到相同结果，不会把计数翻倍。
- 超出范围的计数按 `shared/post-shape.js` 规范化（负数归 0，标记为真但计数 0 抬到 1）。

### 4.8 清空动态

```
DELETE /api/posts
204 （清空全部动态，**保留**个人资料）
```

### 4.9 读取资料

```
GET /api/profile
200 { "profile": { "name": "我", "bio": "这个人很懒，什么都没写。", "avatar": "🙂", "joinedAt": 1794535200000 } }
```

- 首次访问即返回默认资料（服务端初始化时创建）。

### 4.10 更新资料

```
PUT /api/profile
body { "name": "阿铁", "bio": "简介", "avatar": "🦊" }
200 { "profile": { ... } }
```

- 四个字段（`name` / `bio` / `avatar` / `mood`）均可选，只更新传入的字段。
- `name` trim 后为空 → 回退默认「我」；超过 20 字 → 截断。
- `bio` 超过 60 字 → 截断。
- `avatar` 不在白名单 → `400 INVALID_AVATAR`（不做静默忽略，便于发现前端 bug）。
- `mood` 不在白名单 → `400 INVALID_MOOD`；类型不是字符串 → `400 INVALID`。
- **`joinedAt` 不可通过此接口修改**。

> 心情复用本接口而非单独端点：它本来就是 profile 的一个字段，
> 这样自动获得了备份导出 / 导入的覆盖，也少一个端点要维护。

### 4.11 从备份恢复资料

```
POST /api/profile/restore
body { "profile": { "name": "备份用户", "bio": "...", "avatar": "🐼" } }
200 { "applied": true, "profile": { ... } }
200 { "applied": false, "profile": { ... } }   // 当前资料已非默认值，不覆盖
```

- 仅当当前资料**仍是默认值**（name=我、bio=默认、avatar=🙂）时才应用，返回 `applied: true`。
- **判定刻意不含 `mood`**：心情是随手可切的轻量状态，用户点过心情不该导致
  导入备份时昵称恢复不了。

### 4.12 重置资料

```
POST /api/profile/reset
200 { "profile": { ... } }   // name/bio/avatar 回默认，joinedAt 更新为当前时间
```

### 4.13 切换互动状态（点赞 / 收藏）

```
POST /api/posts/:id/reactions/:kind
```

`kind` ∈ `like` | `favorite`（白名单见 `REACTION_KINDS`）。

**请求体可选**，用于指定目标状态：

```json
{ "action": "add" }
```

| action | 含义 |
| --- | --- |
| 省略 / `toggle` | 在「有」与「无」之间切换 |
| `add` | 幂等地设为「有」（已经是「有」则不变） |
| `remove` | 幂等地设为「无」（已经是「无」则不变） |

```json
200 { "post": { "id": "...", "text": "...", "createdAt": 1,
                "likes": 1, "favorites": 0, "liked": true, "favorited": false } }
404 { "error": { "code": "NOT_FOUND", "message": "动态不存在" } }
400 { "error": { "code": "INVALID", "message": "未知的互动类型" } }
```

- 返回**更新后的完整 Post**，前端直接覆盖本地副本即可，无需重新拉列表。
- 为什么同时要 `add` / `remove`：备份导入需要**幂等的目标状态**。
  同一份备份导入两次必须得到相同结果，用 toggle 会导致反复翻转。
- 状态迁移（含计数自洽规则）统一调用 `shared/post-shape.js`，两端行为必然一致。

## 5. 共享常量

`shared/constants.js` 同时被前端与后端导入，避免两处魔数漂移：

```js
export const MAX_LEN = 280
export const MOODS = [
  { key: 'great', emoji: '😄', label: '心情好' },
  { key: 'calm',  emoji: '🙂', label: '平静' },
  { key: 'tired', emoji: '😮‍💨', label: '有点累' },
  { key: 'down',  emoji: '😔', label: '低落' },
  { key: 'fired', emoji: '🔥', label: '干劲满满' }
]
export const DEFAULT_MOOD = 'great'
export const NAME_MAX = 20
export const BIO_MAX = 60
export const AVATARS = ['🙂','😀','🐱','🐼','🦊','🚀','🌙','🍀','🎧','📚']
export const DEFAULT_NAME = '我'
export const DEFAULT_BIO = '这个人很懒，什么都没写。'
export const DEFAULT_AVATAR = '🙂'
export const API_BASE = '/api'
```

## 6. 前端配套约定（重要）

换成 HTTP 后所有写操作变成**异步**，以下行为必须遵守：

1. **发布失败不得丢内容**：`PostComposer` 不再自行清空。改为：
   - 接收 `pending` prop（请求中禁用按钮）
   - 暴露 `clear()` 方法
   - 由 `App.vue` 在请求**成功后**调用 `clear()`
2. **删除失败要有反馈**：`App.vue` 的 `handleRemove` 需 `await`，失败时 toast 提示且不动列表。
3. **加载态**：首次加载动态时展示加载中，失败展示错误与重试入口。
4. **服务不可达**：后端没启动时，页面不能白屏或卡死，需给出「无法连接服务」提示与启动指引。
5. **不再使用 localStorage**：删除 `storage.js` / `storage-shim.js` / `storage-context.js`；天气缓存改为模块内存缓存（20 分钟 TTL 保留）。

### 6.1 互动功能的额外约定

6. **乐观更新 + 失败回滚**：点击点赞/收藏时先改本地状态让界面立刻响应，请求失败则回滚到原状态并 toast 提示。理由：点赞是高频轻量操作，等一个往返才变心形会显得卡顿。
7. **按 post 维度做并发保护**：同一条动态的请求进行中时，忽略对该条的再次点击（避免快速双击把计数打乱）。不同动态之间互不影响。
8. **以服务端返回为准**：请求成功后用响应里的 Post 覆盖本地副本，而不是本地推算。
9. **备份兼容**：导出 `version: 2` 并带互动字段；导入 `version: 1` 的旧备份必须继续可用（互动按 0 处理）。

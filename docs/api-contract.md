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
}

type Profile = {
  name: string        // 已 trim，1..20 字
  bio: string         // 已 trim，0..60 字
  avatar: string      // 必须来自 AVATAR 白名单
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
| `NAME_TOO_LONG` | 400 | 昵称超过 20 字（服务端截断后仍超限才报错；正常情况直接截断） |
| `NOT_FOUND` | 404 | 指定 id 的动态不存在 |
| `BAD_JSON` | 400 | 请求体不是合法 JSON |

**服务端是校验的唯一权威**。前端的校验只为即时反馈，不可信任。

## 4. 端点定义

### 4.1 健康检查

```
GET /api/health
200 { "ok": true, "storage": "memory", "uptimeMs": 1234, "startedAt": "2026-11-13T07:00:00.000Z" }
```

### 4.2 统计

```
GET /api/stats
200 { "posts": 3, "chars": 42, "bytes": 812 }
```

- `bytes`：以 UTF-8 计算 `JSON.stringify({posts, profile})` 的字节数，用于前端展示「服务端数据量」。

### 4.3 动态列表

```
GET /api/posts
200 { "posts": [ { "id": "...", "text": "...", "createdAt": 1794534951738 } ] }
```

- 按 `createdAt` **倒序**（新的在前）。
- 无数据时返回 `{ "posts": [] }`（不是 404）。

### 4.4 发布

```
POST /api/posts
body { "text": "  内容  " }
201 { "post": { "id": "...", "text": "内容", "createdAt": 1794534951738 } }
400 { "error": { "code": "EMPTY", "message": "内容不能为空" } }
400 { "error": { "code": "TOO_LONG", "message": "内容不能超过 280 字" } }
```

- 服务端负责 `trim`；trim 后为空 → `EMPTY`。
- `id` 由服务端生成，客户端**不得**指定。

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

- 三个字段均可选，只更新传入的字段。
- `name` trim 后为空 → 回退默认「我」；超过 20 字 → 截断。
- `bio` 超过 60 字 → 截断。
- `avatar` 不在白名单 → `400 INVALID_AVATAR`（不做静默忽略，便于发现前端 bug）。
- **`joinedAt` 不可通过此接口修改**。

### 4.11 从备份恢复资料

```
POST /api/profile/restore
body { "profile": { "name": "备份用户", "bio": "...", "avatar": "🐼" } }
200 { "applied": true, "profile": { ... } }
200 { "applied": false, "profile": { ... } }   // 当前资料已非默认值，不覆盖
```

- 仅当当前资料**仍是默认值**（name=我、bio=默认、avatar=🙂）时才应用，返回 `applied: true`。

### 4.12 重置资料

```
POST /api/profile/reset
200 { "profile": { ... } }   // name/bio/avatar 回默认，joinedAt 更新为当前时间
```

## 5. 共享常量

`shared/constants.js` 同时被前端与后端导入，避免两处魔数漂移：

```js
export const MAX_LEN = 280
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

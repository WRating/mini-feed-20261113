/**
 * 服务入口：创建唯一的 store 实例并启动 HTTP 服务。
 *
 * 为什么单独一个文件（与 app.js 分开）：
 * - `createApp()` 是纯函数式的，测试里反复调用互不影响；
 * - 而「创建 store 单例 + 监听端口」是副作用，只在真实运行时做一次。
 * 把两者混在一起，测试就得为了拿一个 app 而启动服务器。
 *
 * 本文件被 vite.config.js 的 coverage.exclude 排除（见配置），因此无需测试。
 */

import { serve } from '@hono/node-server'

import { createStore } from './store.js'
import { createApp } from './app.js'
import { DEFAULT_PORT } from '../shared/constants.js'

const port = Number(process.env.PORT) || DEFAULT_PORT

// 全进程唯一的存储实例：进程重启即清空，这是契约第 1 节的既定取舍
const store = createStore()
const app = createApp({ store })

serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, (info) => {
  console.log(`Mini Feed API 已启动：http://127.0.0.1:${info.port}`)
  console.log(`数据存储：内存（重启即清空）`)
})

/** 优雅退出：避免长期持有端口导致下次启动 EADDRINUSE */
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`\n收到 ${signal}，正在关闭服务…`)
    process.exit(0)
  })
}

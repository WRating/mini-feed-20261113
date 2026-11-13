/**
 * 应用入口。
 *
 * 这里曾有一行 `import './services/storage-shim'`，排在所有 import 之前。
 * 它之所以存在，是因为旧版本把数据存在浏览器 localStorage 里，而某些环境
 * （隐私模式、企业策略禁用站点数据）会让访问 localStorage 直接抛错，进而
 * 在第三方库的模块加载阶段就崩掉、页面白屏，所以必须提前把存储修补成内存替身。
 *
 * 现在数据已全部后端化（见 docs/api-contract.md 第 6 节）：前端不再读写浏览器存储，
 * 没有任何模块会因为 localStorage 不可用而崩，这个补丁连同 storage.js /
 * storage-context.js 一起被删除了。
 *
 * 如果将来又要用浏览器存储，请连同这段注释一起删除，并注意「必须先于第三方库求值」
 * 这个时序约束 —— 它正是当初把 import 放在第一位的原因。
 */
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './assets/main.css'

createApp(App).use(createPinia()).mount('#app')

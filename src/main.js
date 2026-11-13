/**
 * 应用入口。
 *
 * ⚠️ storage-shim 必须是第一个 import：
 * 它要在 Pinia / Vue 等第三方库求值之前，把「访问 localStorage 会抛错」
 * 的环境修补成可安全访问，否则第三方库会在模块加载阶段崩掉，页面白屏。
 */
import './services/storage-shim'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './assets/main.css'

createApp(App).use(createPinia()).mount('#app')

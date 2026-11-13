import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  // 相对路径，保证 dist 可部署在任意子路径下
  base: './',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    host: '127.0.0.1',
    port: 5173
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['src/**/*.spec.js'],
    exclude: ['node_modules', 'dist'],
    setupFiles: ['./src/test/setup.js'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      include: ['src/**/*.{js,vue}'],
      exclude: ['src/**/*.spec.js', 'src/test/**', 'src/main.js']
    }
  }
})

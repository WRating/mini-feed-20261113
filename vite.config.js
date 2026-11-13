import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const resolvePath = (p) => fileURLToPath(new URL(p, import.meta.url))

/** 后端地址，供开发代理与测试复用 */
const BACKEND_ORIGIN = 'http://127.0.0.1:8787'

export default defineConfig({
  // 相对路径，保证 dist 可部署在任意子路径下
  base: './',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolvePath('./src'),
      // 前后端共享常量：用别名指向同一份文件，避免拷贝
      '@shared': resolvePath('./shared')
    }
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    // 开发期把 /api 转给 Hono，前端始终同源，不需要 CORS
    proxy: {
      '/api': {
        target: BACKEND_ORIGIN,
        changeOrigin: true
      }
    }
  },
  test: {
    globals: true,
    restoreMocks: true,
    // 前端在浏览器环境跑，后端在 node 环境跑，因此分成两个 project
    projects: [
      {
        extends: true,
        test: {
          name: 'frontend',
          environment: 'happy-dom',
          include: ['src/**/*.spec.js'],
          setupFiles: ['./src/test/setup.js']
        }
      },
      {
        extends: true,
        test: {
          name: 'backend',
          environment: 'node',
          include: ['server/**/*.spec.js']
        }
      }
    ],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      include: ['src/**/*.{js,vue}', 'server/**/*.js', 'shared/**/*.js'],
      exclude: [
        'src/**/*.spec.js',
        'server/**/*.spec.js',
        'src/test/**',
        'src/main.js',
        'server/index.js'
      ]
    }
  }
})

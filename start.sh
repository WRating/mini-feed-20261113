#!/usr/bin/env bash
# Mini Feed (Vue 3 + Pinia + Hono) 开发环境启动器（macOS / Linux）
set -e

cd "$(dirname "$0")"

WEB_PORT="${1:-5173}"
API_PORT=8787
URL="http://127.0.0.1:${WEB_PORT}/"

echo ""
echo "  ============================================"
echo "   Mini Feed (Vue 3 + Pinia + Hono) - Dev"
echo "  ============================================"
echo "   Folder : $(pwd)"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "  [ERROR] Node.js 未安装，请先安装 Node 18+。"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "  [INFO] 未找到 node_modules，正在安装依赖..."
  npm install
fi

echo "  Frontend : $URL"
echo "  Backend  : http://127.0.0.1:${API_PORT}/api/health"
echo ""
echo "  数据保存在后端内存中，重启服务即清空。"
echo "  按 Ctrl+C 停止前后端两个服务。"
echo "  --------------------------------------------"
echo ""

# 稍后打开浏览器（前后端就绪需要一点时间）
(
  sleep 5
  if command -v open >/dev/null 2>&1; then
    open "$URL"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL" >/dev/null 2>&1 || true
  fi
) &

# npm run dev 通过 concurrently 同时启动 Hono API 与 Vite
exec npm run dev

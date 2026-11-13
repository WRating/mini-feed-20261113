#!/usr/bin/env bash
# Mini Feed (Vue 3 + Pinia) 开发服务器启动器（macOS / Linux）
set -e

cd "$(dirname "$0")"

PORT="${1:-5173}"
URL="http://127.0.0.1:${PORT}/"

echo ""
echo "  ============================================"
echo "   Mini Feed (Vue 3 + Pinia) - Dev Server"
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

echo "  Address : $URL"
echo ""
echo "  数据保存在浏览器 Local Storage 中。"
echo "  按 Ctrl+C 停止服务。"
echo "  --------------------------------------------"
echo ""

# 稍后打开浏览器（Vite 起来需要一点时间）
(
  sleep 3
  if command -v open >/dev/null 2>&1; then
    open "$URL"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL" >/dev/null 2>&1 || true
  fi
) &

exec npm run dev -- --port "$PORT"

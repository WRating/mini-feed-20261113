#!/usr/bin/env bash
# Mini Feed 本地服务器启动器（macOS / Linux）
set -e

cd "$(dirname "$0")"

PORT="${1:-8000}"
URL="http://127.0.0.1:${PORT}/index.html"

echo ""
echo "  ============================================"
echo "   Mini Feed - 本地服务器启动器"
echo "  ============================================"
echo "   工作目录: $(pwd)"
echo ""

open_browser() {
  sleep 2
  if command -v open >/dev/null 2>&1; then
    open "$URL"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL" >/dev/null 2>&1 || true
  fi
}

open_browser &
OPENER=$!

if command -v python3 >/dev/null 2>&1; then
  echo "   运行时: python3"
  echo "   访问地址: $URL"
  echo ""
  exec python3 -m http.server "$PORT"
elif command -v python >/dev/null 2>&1; then
  echo "   运行时: python"
  echo "   访问地址: $URL"
  echo ""
  exec python -m http.server "$PORT"
elif command -v node >/dev/null 2>&1; then
  echo "   运行时: node"
  echo "   访问地址: $URL"
  echo ""
  exec node serve.js "$PORT"
else
  kill "$OPENER" 2>/dev/null || true
  echo "  [错误] 未找到 Python 或 Node.js，请先安装其中之一。"
  exit 1
fi

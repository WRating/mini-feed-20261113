/**
 * Mini Feed 零依赖静态服务器
 * 仅当本机没有 Python 时由 start.bat / start.sh 调用。
 * 用法：node serve.js [端口]
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const PORT = Number(process.argv[2] || process.env.PORT || 8000);
const HOST = "127.0.0.1";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2"
};

const server = http.createServer(function (req, res) {
  let pathname = "/";
  try {
    pathname = decodeURIComponent((req.url || "/").split("?")[0]);
  } catch (e) {
    pathname = "/";
  }
  if (pathname === "/") pathname = "/index.html";

  const filePath = path.join(ROOT, path.normalize(pathname).replace(/^(\.\.[/\\])+/, ""));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("403 Forbidden");
    return;
  }

  fs.readFile(filePath, function (err, data) {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("404 Not Found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-cache"
    });
    res.end(data);
  });
});

server.listen(PORT, HOST, function () {
  console.log("");
  console.log("  服务已启动： http://" + HOST + ":" + PORT + "/");
  console.log("  按 Ctrl+C 停止");
  console.log("");
});

server.on("error", function (err) {
  if (err.code === "EADDRINUSE") {
    console.error("  端口 " + PORT + " 已被占用，可换端口：node serve.js 8080");
  } else {
    console.error("  启动失败：", err.message);
  }
  process.exit(1);
});

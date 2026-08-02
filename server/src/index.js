import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { initDb } from "./db.js";
import { register, login, getProfile, getUsage, getTransactions } from "./user-routes.js";
import { authMiddleware } from "./auth.js";
import { registerApiRoutes } from "./api-proxy.js";
import { registerRechargeRoutes } from "./recharge-routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = parseInt(process.env.PORT || "8000", 10);

// ─── CORS 配置 ──────────────────────────────────────────────────
// 允许的域名白名单（Vercel 前端域名 + 本地开发）
const corsWhitelist = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    // 允许无 origin 的请求（同域 / curl / Postman / 服务器内部）
    if (!origin || corsWhitelist.length === 0 || corsWhitelist.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked: ${origin}`));
    }
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// 健康检查
app.get("/health", (req, res) => res.json({ status: "ok", timestamp: Date.now() }));

// 用户路由
app.post("/api/auth/register", register);
app.post("/api/auth/login", login);
app.get("/api/user/profile", authMiddleware, getProfile);
app.get("/api/user/usage", authMiddleware, getUsage);
app.get("/api/user/transactions", authMiddleware, getTransactions);

// 充值路由
registerRechargeRoutes(app);

// AI API 代理路由（需要认证）
registerApiRoutes(app);

// 静态文件托管（前端构建产物，如果存在的话）
const staticDir = path.join(__dirname, "..", "web", "dist");
app.use(express.static(staticDir));

// SPA 回退
app.get("/{*path}", (req, res) => {
  const indexPath = path.join(staticDir, "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).json({ error: "Not found" });
  }
});

// 全局错误处理
app.use((err, req, res, _next) => {
  console.error("[ERROR]", err.message);
  if (err.message?.startsWith("CORS blocked")) {
    return res.status(403).json({ error: { message: "域名未授权" } });
  }
  res.status(500).json({ error: { message: "服务器内部错误" } });
});

// 初始化数据库后启动
async function main() {
  await initDb();
  console.log("Database initialized.");
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});

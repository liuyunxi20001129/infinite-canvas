# Infinite Canvas 商用版 — 部署指南

基于 basketikun/infinite-canvas (AGPL-3.0) 开源项目改造的零成本商用部署方案。

## 项目结构

```
infinite-canvas-commercial/
├── api-config.ts              # 前端：API 配置锁定 + 用户 token 管理
├── auth.ts                    # 前端：注册/登录/profile API 服务
├── auth-modal.tsx             # 前端：登录/注册弹窗组件
├── channel-editor-drawer.tsx  # 前端：渠道编辑（移除 API Key 输入）
├── use-config-store.ts        # 前端：配置状态管理（锁定 API 配置）
├── user-status-actions.tsx    # 前端：用户余额显示 + 登录/退出
├── vercel.json                # Vercel 前端部署配置
├── render.yaml                # Render 后端部署配置
├── supabase-schema.sql        # Supabase PostgreSQL 建表脚本
├── docker-compose.yml         # Docker 一体化部署（备选方案）
├── Dockerfile                 # Docker 构建文件
├── nginx.conf                 # Nginx 反向代理配置
├── test-api.sh                # API 全链路测试脚本
└── server/                    # 后端服务
    ├── .env.example           # 环境变量模板
    └── src/
        ├── index.js           # Express 入口 + CORS + 路由注册
        ├── db.js              # 数据库（SQLite/PostgreSQL 双模式）
        ├── auth.js            # JWT 认证中间件
        ├── user-routes.js     # 用户注册/登录/信息路由
        ├── api-proxy.js       # API 代理 + 计费扣费
        └── recharge-routes.js # 充值/支付路由
```

## 部署步骤

### 1. 准备账号（全部免费）

| 平台 | 用途 | 注册地址 |
|------|------|----------|
| GitHub | Fork 仓库 + 授权登录 | https://github.com |
| Vercel | 前端托管 | https://vercel.com |
| Render | 后端托管 | https://render.com |
| Supabase | PostgreSQL 数据库 | https://supabase.com |
| UptimeRobot | Render 保活 | https://uptimerobot.com |

### 2. Fork 原始仓库（AGPL 合规）

```bash
# 在 GitHub 上 Fork basketikun/infinite-canvas
# 将本目录中的修改文件覆盖到 Fork 仓库对应位置：
# - 前端文件 → web/src/ 对应目录
# - server/ 目录 → 仓库根目录
# - vercel.json, render.yaml, supabase-schema.sql → 仓库根目录
```

### 3. 配置 Supabase 数据库

1. 在 Supabase 创建新项目
2. 进入 SQL Editor，执行 `supabase-schema.sql`
3. 记录 Project URL 和 Database 连接串

连接串格式：
```
postgresql://postgres.[PROJECT]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
```

### 4. 部署后端到 Render

1. 在 Render 创建 Web Service，连接 GitHub Fork 仓库
2. Root Directory: `server`
3. Build Command: `npm install`
4. Start Command: `node src/index.js`
5. 配置环境变量：

| 变量 | 值 |
|------|-----|
| DATABASE_URL | Supabase 连接串 |
| DATABASE_SSL | true |
| UPSTREAM_BASE_URL | 上游 API 地址 |
| UPSTREAM_API_KEY | 上游 API 密钥 |
| JWT_SECRET | 随机 32+ 字符密钥 |
| CORS_ORIGINS | https://your-app.vercel.app |
| FREE_CREDIT | 1000 |
| PRICE_IMAGE / VIDEO / TEXT / AUDIO | 5 / 50 / 1 / 3 |

或直接使用 `render.yaml` Blueprint 部署。

### 5. 部署前端到 Vercel

1. 在 Vercel 导入 GitHub Fork 仓库
2. Root Directory: `web`
3. 构建命令已由 `vercel.json` 配置
4. 添加环境变量：`VITE_API_PROXY_URL=https://your-render-app.onrender.com`
5. Deploy

### 6. 配置保活

在 UptimeRobot 添加 HTTP 监控：
- 目标：`https://your-render-app.onrender.com/health`
- 间隔：10 分钟

### 7. 接入真实支付（可选）

在 Render 环境变量中配置：
- 支付宝：`ALIPAY_APP_ID`、`ALIPAY_PRIVATE_KEY`、`ALIPAY_PUBLIC_KEY`、`ALIPAY_NOTIFY_URL`
- 微信支付：`WECHAT_APP_ID`、`WECHAT_MCH_ID`、`WECHAT_API_V3_KEY`、`WECHAT_NOTIFY_URL`

留空则使用模拟支付模式（开发测试用）。

## 本地开发

```bash
# 后端（使用 SQLite，无需 Supabase）
cd server
cp .env.example .env  # DATABASE_URL 留空 = SQLite 模式
npm install
npm run dev

# 测试 API
cd ..
bash test-api.sh

# 前端（需要原始 infinite-canvas 项目）
cd web
npm install --legacy-peer-deps
npm run dev
```

## 定价策略

| 类型 | 上游成本 | 用户售价 | 利润率 |
|------|----------|----------|--------|
| 图片生成 | ¥0.02/张 | ¥0.05/张 | 150% |
| 视频生成 | ¥0.30/次 | ¥0.50/次 | 67% |
| 文本对话 | ¥0.005/次 | ¥0.01/次 | 100% |
| 音频生成 | ¥0.01/次 | ¥0.03/次 | 200% |

## AGPL-3.0 合规

- 必须公开全部修改源码（Fork 仓库设为 Public）
- 保留原作者版权声明
- 沿用 AGPL-3.0 协议
- 网络服务用户可获取全部源码

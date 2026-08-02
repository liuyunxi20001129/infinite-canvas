# 构建 Vite 前端产物（使用 node 替代 bun，兼容国内环境）
FROM node:22-alpine AS web-build

WORKDIR /app/web
COPY web/package.json web/bun.lock ./
RUN npm install --legacy-peer-deps
COPY VERSION /app/VERSION
COPY CHANGELOG.md /app/CHANGELOG.md
COPY web ./
RUN npx vite build

# 构建后端
FROM node:22-alpine AS server-build

WORKDIR /app/server
COPY server/package.json ./
RUN npm install --production
COPY server ./

# 运行镜像：nginx 静态前端 + Node.js 后端 API 代理
FROM node:22-alpine

# 安装 nginx
RUN apk add --no-cache nginx

# 复制前端构建产物
COPY --from=web-build /app/web/dist /usr/share/nginx/html

# 复制后端
COPY --from=server-build /app/server /app/server
COPY server/.env.example /app/server/.env

# nginx 配置
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY web/docker-entrypoint.sh /docker-entrypoint.d/40-runtime-config.sh
RUN chmod +x /docker-entrypoint.d/40-runtime-config.sh

# 启动脚本：同时启动 nginx 和后端
RUN echo '#!/bin/sh' > /app/start.sh && \
    echo 'set -e' >> /app/start.sh && \
    echo 'nginx -g "daemon off;" &' >> /app/start.sh && \
    echo 'cd /app/server && node src/index.js' >> /app/start.sh && \
    chmod +x /app/start.sh

EXPOSE 3000

CMD ["/app/start.sh"]

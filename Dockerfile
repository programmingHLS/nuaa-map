# ── 构建阶段：Node.js 编译 React + Vite 前端 ──
FROM node:22-alpine AS builder
WORKDIR /app

# npm 使用国内镜像，避免 NAS 网络直连 npmjs.org 超时/卡死
ENV npm_config_registry=https://registry.npmmirror.com

# 安装依赖（利用 Docker 层缓存）
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# 复制源码并构建
COPY frontend/ ./
RUN npm run build

# ── 运行阶段：Nginx 提供静态文件服务 ──
FROM nginx:alpine

# 复制构建产物
COPY --from=builder /app/dist /usr/share/nginx/html

# 修复文件权限（nginx worker 以 nginx 用户运行，非 root）
RUN chmod -R 755 /usr/share/nginx/html

# SPA 路由回退：所有路径都返回 index.html
RUN echo 'server { \
    listen 80; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { try_files $uri $uri/ /index.html; } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

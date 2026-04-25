# Dockerfile — AutoTrading worker / API
# 同時 host：
#  - REST API (express)
#  - /ws/autotrading WebSocket
#  - autonomousAgent 常駐輪詢
#
# 用法：
#   docker build -t stockanalyze-autotrading .
#   docker run -p 8080:8080 \
#     -e DATABASE_URL=... \
#     -e OPENROUTER_API_KEY=... \
#     stockanalyze-autotrading

FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NODE_ENV=production

# 1) 安裝依賴（複製鎖定檔以利快取）
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

# 2) 複製專案
COPY . .

# 3) 建置前端 SPA（靜態 dist/ 由 server.ts 提供）
RUN npm install --no-save vite @vitejs/plugin-react && \
    npx vite build && \
    npm prune --omit=dev

EXPOSE 8080
ENV PORT=8080

# tsx 是 dev dependency，在 production 環境下也保留以便執行 .ts
# 若想完全 transpile：把 server.ts 改用 tsc + node 執行，但目前直接用 tsx 較簡單。
RUN npm install --no-save tsx
CMD ["node", "--import", "tsx/esm", "server.ts"]

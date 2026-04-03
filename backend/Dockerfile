# 第一階段：編譯前端 (Vue)
FROM oven/bun:1-debian AS frontend-build
WORKDIR /app/frontend

# 複製相依性描述檔以供快取
COPY frontend/package.json frontend/bun.lock* ./
RUN bun install

# 複製前端源碼並進行編譯
COPY frontend .
RUN bun run build

# 第二階段：執行環境
FROM oven/bun:1-debian

# 更新系統並安裝 nodejs 與 npm (Gemini CLI 依賴)
RUN apt-get update && apt-get install -y nodejs npm && rm -rf /var/lib/apt/lists/*

# 全域安裝 gemini-cli
RUN npm install -g @google/gemini-cli

WORKDIR /app

# 複製後端相依性檔案
COPY backend/package.json backend/bun.lock* ./backend/
WORKDIR /app/backend
RUN bun install --frozen-lockfile || bun install

# 複製後端源碼
WORKDIR /app
COPY backend ./backend/

# 從編譯階段複製前端產物到正確的位置 (供 Hono serveStatic 使用)
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# 切換到執行目錄
WORKDIR /app/backend

# 曝露預設通訊埠
EXPOSE 3002

# 設定環境變數 (可由 docker-compose 覆蓋)
ENV PORT=3002
ENV NODE_ENV=production

# 啟動應用程式
CMD ["bun", "run", "start"]

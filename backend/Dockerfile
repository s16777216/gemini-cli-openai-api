# 第一階段：編譯前端 (Vue)
FROM oven/bun:1-debian AS frontend-build
WORKDIR /app/frontend

# 複製相依性描述檔
COPY frontend/package.json frontend/bun.lock* ./
RUN bun install

# 複製前端源碼並進行編譯
COPY frontend .
RUN bun run build

# 第二階段：執行環境 (純 Bun 環境)
FROM oven/bun:1-debian
WORKDIR /app

# 僅複製後端相依性檔案以供快取
COPY backend/package.json backend/bun.lock* ./backend/
RUN cd backend && (bun install --frozen-lockfile || bun install)

# 複製後端源碼
COPY backend ./backend/

# 從編譯階段複製前端產物
# 注意：後端 src/index.ts 的 serveStatic 預設尋找 ../frontend/dist
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# 確保資料持久化目錄存在
RUN mkdir -p /app/backend/data

# 設定執行目錄
WORKDIR /app/backend

# 曝露通訊埠
EXPOSE 3002

# 設定環境變數
ENV PORT=3002
ENV NODE_ENV=production

# 啟動應用程式 (直接使用 Bun 執行)
CMD ["bun", "run", "start"]

FROM oven/bun:1-debian

# 更新系統並安裝 nodejs 與 npm (因為 @google/gemini-cli 依賴 node)
RUN apt-get update && apt-get install -y nodejs npm && rm -rf /var/lib/apt/lists/*

# 全域安裝 gemini-cli
RUN npm install -g @google/gemini-cli

WORKDIR /app

# 複製依賴描述檔以供快取 (路徑相對於 build context)
COPY backend/package.json backend/bun.lock* ./backend/

# 安裝相依套件
WORKDIR /app/backend
RUN bun install --frozen-lockfile || bun install

# 複製原始碼 (路徑相對於 build context)
WORKDIR /app
COPY backend ./backend/
# 如果有 frontend/dist，也一併複製，確保服務正常
COPY frontend/dist ./frontend/dist

# 切換到執行目錄
WORKDIR /app/backend

# 曝露預設通訊埠
EXPOSE 3002

# 設定執行指令
CMD ["bun", "run", "start"]

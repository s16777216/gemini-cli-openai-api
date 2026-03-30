FROM oven/bun:1-debian

# 更新系統並安裝 nodejs 與 npm (因為 @google/gemini-cli 依賴 node)
RUN apt-get update && apt-get install -y nodejs npm && rm -rf /var/lib/apt/lists/*

# 全域安裝 gemini-cli
RUN npm install -g @google/gemini-cli

WORKDIR /app

# 複製依賴描述檔以供快取
COPY package.json bun.lockb* ./

# 安裝相依套件
RUN bun install --frozen-lockfile || bun install

# 複製原始碼
COPY . .

# 曝露預設通訊埠
EXPOSE 3002

# 設定執行指令
CMD ["bun", "run", "start"]

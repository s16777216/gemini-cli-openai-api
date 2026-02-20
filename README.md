# gemini-cli-openai-api

> 將 [Gemini CLI](https://github.com/google-gemini/gemini-cli) 包裝為 **OpenAI 相容 API** 的輕量代理伺服器。

讓任何支援 OpenAI Chat Completions API 的工具（如 OpenCode、Continue、Cursor 等），都能透過本地端的 Gemini CLI 存取 Gemini 模型，無需額外的 API Key 管理。

---

## 目錄

- [gemini-cli-openai-api](#gemini-cli-openai-api)
  - [目錄](#目錄)
  - [運作原理](#運作原理)
  - [前置需求](#前置需求)
    - [安裝 Gemini CLI 並登入](#安裝-gemini-cli-並登入)
  - [安裝與啟動](#安裝與啟動)
    - [使用 Node.js（不使用 Bun）](#使用-nodejs不使用-bun)
  - [API 端點](#api-端點)
  - [使用範例](#使用範例)
    - [curl（串流模式）](#curl串流模式)
    - [設定為 OpenAI 相容端點](#設定為-openai-相容端點)
  - [支援模型](#支援模型)
  - [工具呼叫（Tool Calls）](#工具呼叫tool-calls)
  - [環境變數](#環境變數)
  - [專案結構](#專案結構)
  - [授權](#授權)

---

## 運作原理

```
客戶端（OpenAI 格式請求）
        │
        ▼
 gemini-cli-api（Hono 代理伺服器）
        │  1. 將訊息歷史展平為純文字提示
        │  2. 寫入暫存檔
        │  3. 執行 `gemini --output-format stream-json`
        │  4. 解析 stream-json 輸出
        │  5. 轉換為 OpenAI SSE 格式回傳
        ▼
   Gemini CLI（本地端執行）
```

本代理**不**直接呼叫 Gemini REST API，而是透過 `gemini` CLI 命令執行推理，因此使用 CLI 的認證機制（Google 帳號登入），無需管理 API Key。

---

## 前置需求

| 工具                                                      | 版本需求 | 說明                        |
| --------------------------------------------------------- | -------- | --------------------------- |
| [Bun](https://bun.sh)                                     | ≥ 1.0    | 主要執行環境（開發模式用）  |
| [Node.js](https://nodejs.org)                             | ≥ 18     | 可選，使用 `tsx` 替代 Bun   |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli) | 最新版   | 需已登入 Google 帳號        |
| PowerShell (`pwsh`)                                       | 任意版本 | Windows 執行 CLI 命令時使用 |

### 安裝 Gemini CLI 並登入

```bash
npm install -g @google/gemini-cli
gemini  # 首次執行會引導登入
```

---

## 安裝與啟動

```bash

# 安裝相依套件
bun install
# 或 npm install

# 開發模式（熱重載）
bun run dev

# 生產模式
bun run start
```

伺服器預設在 **`http://localhost:3000`** 啟動。

### 使用 Node.js（不使用 Bun）

```bash
npm run dev:node   # 開發模式（tsx watch）
npm run build      # 編譯 TypeScript
npm run start:node # 執行編譯後的版本
```

---

## API 端點

| 方法   | 路徑                | 說明                                          |
| ------ | ------------------- | --------------------------------------------- |
| `GET`  | `/`                 | 健康檢查，回傳 `Gemini CLI Proxy is running!` |
| `GET`  | `/models`           | 列出支援的模型清單（OpenAI 格式）             |
| `POST` | `/chat/completions` | 聊天完成，相容 OpenAI Chat Completions API    |

> **注意**：目前**不**掛載 `/v1` 前綴，請直接使用上述路徑。

---

## 使用範例

### curl（串流模式）

```bash
curl -N http://localhost:3000/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-2.5-flash",
    "stream": true,
    "messages": [
      {"role": "user", "content": "用繁體中文簡單介紹量子力學"}
    ]
  }'
```

### 設定為 OpenAI 相容端點

將任何支援自訂 OpenAI Base URL 的工具指向：

```
http://localhost:3000
```

API Key 欄位填入任意字串即可（本代理不驗證 Key）。

---

## 支援模型

透過 `GET /models` 可取得完整清單，目前支援：

| 模型 ID                  | 說明         |
| ------------------------ | ------------ |
| `gemini-2.5-flash-lite`  | 輕量快速版   |
| `gemini-2.5-flash`       | 均衡效能版   |
| `gemini-2.5-pro`         | 高品質版     |
| `gemini-3-flash-preview` | Flash 預覽版 |
| `gemini-3-pro-preview`   | Pro 預覽版   |

---

## 工具呼叫（Tool Calls）

本代理支援 OpenAI 格式的 `tools` 參數。由於 Gemini CLI 不支援直接的函式呼叫格式，代理採用**提示注入**方式：

1. 將工具定義轉換為純文字格式說明，附加於提示開頭
2. 要求 Gemini 以 `TOOL_CALL:{...}` 純文字格式回應工具呼叫意圖
3. 代理偵測 `TOOL_CALL:` 標記後，將其轉換為標準 OpenAI `tool_calls` SSE chunk 回傳

```
# 工具模式流程
請求（含 tools 定義）
  → 注入工具使用說明至提示
  → Gemini 回應 TOOL_CALL:{...}
  → 代理解析並轉換為 OpenAI tool_calls 格式
  → 客戶端收到標準工具呼叫事件
```

---

## 環境變數

```env
# 暫存檔資料夾路徑（預設：./temp）
TEMP_FOLDER=./temp
```

---

## 專案結構

```
├── src/
│   ├── index.ts            # 伺服器入口、路由定義
│   ├── type.ts             # 型別定義、提示處理工具函式
│   └── implements/
│       └── chat.ts         # /chat/completions 核心實作
├── temp/                   # 暫存提示檔（自動管理）
├── package.json
└── tsconfig.json
```

---

## 授權

MIT License

# gemini-cli-openai-api

> 將 Google Gemini 原生 API 包裝為 **OpenAI 相容 API** 的輕量代理伺服器。

讓任何支援 OpenAI Chat Completions API 的工具（如 OpenCode、Continue、Cursor 等），都能透過本代理存取 Gemini 模型，並支援多帳號負載均衡。

---

## 目錄

- [運作原理](#運作原理)
- [前置需求](#前置需求)
- [安裝與啟動](#安裝與啟動)
- [Docker 部署](#docker-部署)
- [API 端點](#api-端點)
- [使用範例](#使用範例)
- [支援模型](#支援模型)
- [工具呼叫（Tool Calls）](#工具呼叫tool-calls)
- [單元測試](#單元測試)
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
        │  1. 驗證管理員或 API Key 權限
        │  2. 負載均衡取用 OAuth2 憑證池
        │  3. 轉換為 Gemini 原生 API 格式
        │  4. 直接透過 HTTPS 呼叫 Google API
        │  5. 轉換串流回應為 OpenAI SSE 格式
        ▼
   Google Gemini API (REST)
```

本代理直接呼叫 Gemini REST API，透過內建的 OAuth2 流程進行認證，支援動態管理多個 Google 帳號，兼顧效能與擴充性。

---

## 前置需求

| 工具                   | 版本需求 | 說明                               |
| ---------------------- | -------- | ---------------------------------- |
| [Bun](https://bun.sh)  | ≥ 1.0    | 主要執行環境（極速啟動與原生測試） |
| [Node.js](https://nodejs.org) | ≥ 20     | 備援執行環境 (可選)                |
| Google Cloud Project   | N/A      | 需具備 OAuth2 Client ID/Secret     |

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

伺服器預設在 **`http://localhost:3002`** 啟動。

### 使用 Node.js（不使用 Bun）

```bash
npm run dev:node   # 開發模式（tsx watch）
npm run build      # 型別檢查（tsc，noEmit）
npm run start:node # 執行編譯後的版本
```

---

## Docker 部署

我們提供 `Dockerfile` 與 `docker-compose.yml` 方便直接部署於容器環境中。本專案採用 **多階段構建 (Multi-stage Build)**，會自動在容器內完成「前端編譯」與「後端整合」，確保環境一致性且無需在主機安裝任何開發工具。

### 1. 啟動準備

請確保系統中已安裝 [Docker](https://docs.docker.com/get-docker/) 與 Docker Compose。

### 2. 編譯並啟動 (首次執行)

在專案根目錄執行以下指令，系統會自動編譯前端並啟動後端：

```bash
docker-compose up -d --build
```

### 3. 初始化授權

啟動服務後，請瀏覽管理介面（預設為 `http://localhost:3002/web`），進入「上游管理」頁面，點擊「新增 Google 帳號」完成 OAuth2 授權流程。授權成功後，憑證會自動儲存於 SQLite 資料庫中供負載均衡器使用。

伺服器將執行於 http://localhost:3002。
所有的數據會被存入 `./data/` 目錄中以確保持久化。

---

## 效能與優化

本專案採用效能優先的設計模式：

- **直接 API 代理**：捨棄邊緣工具依賴，直接與 Google 端點溝通，最小化中間層延遲。
- **異步串流處理**：完美支援 SSE 串流轉換，前端可即時呈現打字機效果。
- **負載均衡**：支援多組 OAuth2 憑證輪詢，避免單一帳號頻率限制 (429 Rate Limit)。
- **持久化 Session**：整合 SQLite 管理對話歷史，支援 Session 恢復與長對話記憶。

## API 端點

所有路由掛載於 `/v1` 前綴：

| 方法   | 路徑                   | 說明                                          |
| ------ | ---------------------- | --------------------------------------------- |
| `GET`  | `/v1/`                 | 健康檢查，回傳 `Gemini CLI Proxy is running!` |
| `GET`  | `/v1/models`           | 列出支援的模型清單（OpenAI 格式）             |
| `POST` | `/v1/chat/completions` | 聊天完成，相容 OpenAI Chat Completions API    |

---

## 使用範例

### curl（串流模式）

```bash
curl -N http://localhost:3002/v1/chat/completions \
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
http://localhost:3002/v1
```

API Key 欄位填入任意字串即可（本代理不驗證 Key）。

#### OpenCode (`opencode.json`) 設定範例

```json
{
  "provider": {
    "gemini-proxy": {
      "options": {
        "baseURL": "http://localhost:3002/v1"
      },
      "models": {
        "gemini-2.5-flash": {
          "name": "gemini-2.5-flash (Gemini CLI Proxy)"
        }
      }
    }
  }
}
```

---

## 支援模型

透過 `GET /v1/models` 可取得完整清單，目前支援：

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
請求（含 tools 定義）
  → 注入工具使用說明至提示
  → Gemini 回應 TOOL_CALL:{...}（純文字）
  → 代理解析並轉換為 OpenAI tool_calls 格式
  → 客戶端收到標準工具呼叫事件
```

---

## 單元測試

測試使用 [Bun 的內建測試工具](https://bun.sh/docs/cli/test)，無需額外安裝。

```bash
bun test           # 執行所有測試
bun test --watch   # 監聽模式（存檔自動重跑）
```

| 測試檔案                            | 涵蓋模組                                        |
| ----------------------------------- | ----------------------------------------------- |
| `tests/schemas/chat.test.ts`        | Zod 驗證（MessageSchema、ChatCompletionSchema） |
| `tests/utils/sseFormatter.test.ts`  | SSE chunk 格式與 finish_reason                  |
| `tests/utils/chatStream.test.ts`    | `splitLines`、`flushToolOrText` 分支邏輯        |
| `tests/utils/promptBuilder.test.ts` | 訊息展平、工具提示注入                          |

---

## 環境變數

複製 `.env.example` 為 `.env` 後依需求調整：

```bash
cp .env.example .env
```

| 變數          | 說明                             | 預設值   |
| ------------- | -------------------------------- | -------- |
| `PORT`            | 伺服器監聽埠號                             | `3002`                                          |
| `LOG_LEVEL`       | `debug`、`info`、`warn`、`error`           | `info`                                          |
| `GEMINI_CLI_PATH` | Gemini CLI 的 `dist/index.js` 絕對路徑     | (自動偵測 `node_modules` 路徑)                  |
| `NO_UPDATE_CHECK` | 是否禁止更新檢查 (`1` 代表禁止)            | `1`                                             |
| `TEMP_FOLDER`     | 其他輔助暫存目錄                           | `./temp`                                        |

---

## 專案結構

```
src/
├── config.ts                   # 集中設定（port、models、tempFolder）
├── index.ts                    # 伺服器入口、路由定義
├── schemas/
│   └── chat.ts                 # Zod 驗證 schemas + Message interface
├── services/
│   └── gemini.ts               # GeminiArgument（CLI 參數建構與環境注入）
├── utils/
│   ├── logger.ts               # 結構化 Logger（支援不同層級與格式）
│   ├── promptBuilder.ts        # 訊息展平與工具提示注入
│   ├── sseFormatter.ts         # OpenAI SSE 協議格式化
│   └── chatStream.ts           # 異步串流解析與 Tool Call 轉換
└── implements/
    ├── index.ts                # Handler 匯出集合
    ├── chat.ts                 # Chat Completions 核心（Stdin Piping 實作）
    └── modelList.ts            # 模型清單對應端點
tests/
├── schemas/
│   └── chat.test.ts
└── utils/
    ├── sseFormatter.test.ts
    ├── chatStream.test.ts
    └── promptBuilder.test.ts
temp/                           # 暫存提示檔（自動管理）
.env.example                    # 環境變數範本
package.json
tsconfig.json
```

---

## 授權

MIT License

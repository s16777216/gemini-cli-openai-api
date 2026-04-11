import { HttpChatTransport, type UIMessageChunk, type UIMessage } from 'ai';

/**
 * OpenAIChatTransport
 * 
 * 由於 AI SDK v4+ UI 預設使用自己的 Data Stream Protocol (例如 0:"..." 格式)，
 * 與標準的 OpenAI SSE 格式 (data: {...}) 不相容，此類別負責橋接兩者。
 * 
 * 功能：
 * 1. Request 時將 UIMessage 的 parts 拍平為 OpenAI 預期的 content 字串。
 * 2. Response 時解析 `data: ` 開頭的 OpenAI SSE 串流並映射回 Text Chunk。
 */
export class OpenAIChatTransport<UI_MESSAGE extends UIMessage> extends HttpChatTransport<UI_MESSAGE> {
  constructor(options: any) {
    const { onSessionId, ...restOptions } = options;
    super({
      ...restOptions,
      /**
       * 注入自定義 fetch 以攔截 Response Headers
       */
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        const response = await fetch(input, init);
        
        // 嘗試從 Header 擷取 Session ID
        const sessionId = response.headers.get('x-session-id');
        if (sessionId && onSessionId) {
          onSessionId(sessionId);
        }
        
        return response;
      },
      /**
       * 覆寫請求建構邏輯：
       * 將 AI SDK 的 parts 格式轉換回標準 OpenAI 格式
       */
      prepareSendMessagesRequest: async (params: any) => {
        return {
          body: {
            ...params.body,
            stream: true, // 強制開啟串流模式
            messages: params.messages.map((m: any) => ({
              role: m.role,
              content: m.parts
                ? m.parts.map((p: any) => (p.type === 'text' ? p.text : '')).join('')
                : m.content || '',
            })),
          },
        };
      },
    });
  }

  /**
   * 覆寫串流解析邏輯：
   * 解析 OpenAI 的 `data: {"choices": [{"delta": {"content": "..."}}]}` 並轉為 UI Message Chunk。
   */
  protected processResponseStream(
    stream: ReadableStream<Uint8Array>,
  ): ReadableStream<UIMessageChunk> {
    const decoder = new TextDecoder();
    let buffer = '';
    let hasStarted = false;
    let messageId = '';

    return new ReadableStream({
      async start(controller) {
        const reader = stream.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.startsWith('data: ')) {
                const data = trimmed.slice(6);

                // 處理 [DONE] 結束標記
                if (data === '[DONE]') {
                  if (hasStarted) {
                    controller.enqueue({ type: 'text-end', id: messageId });
                    controller.enqueue({ type: 'finish', finishReason: 'stop' });
                  }
                  continue;
                }

                try {
                  const json = JSON.parse(data);
                  const content = json.choices?.[0]?.delta?.content;

                  // 初始化訊息狀態
                  if (!hasStarted && (content || json.id)) {
                    messageId = json.id || `msg-${Date.now()}`;
                    controller.enqueue({ type: 'start', messageId });
                    controller.enqueue({ type: 'text-start', id: messageId });
                    hasStarted = true;
                  }

                  if (content) {
                    controller.enqueue({
                      type: 'text-delta',
                      id: messageId,
                      delta: content
                    });
                  }

                  const finishReason = json.choices?.[0]?.finish_reason;
                  if (finishReason) {
                    controller.enqueue({ type: 'text-end', id: messageId });
                    controller.enqueue({
                      type: 'finish',
                      finishReason: (finishReason === 'stop' ? 'stop' : 'other') as any
                    });
                  }
                } catch (e) {
                  // 部分區塊可能解析失敗，屬於正常現象，等待下一區塊。
                }
              }
            }
          }
        } catch (e) {
          controller.error(e);
        } finally {
          reader.releaseLock();
          controller.close();
        }
      },
    });
  }
}

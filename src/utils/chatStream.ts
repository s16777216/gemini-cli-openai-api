import { toSSEChunk, sendToolCallSSE, TOOL_CALL_PREFIX } from "./sseFormatter";

/**
 * 將 gemini CLI 的 stderr 輸出轉到 console（過濾憑證提示）。
 * 非同步背景執行，不 await。
 */
export function pipeStderr(
    stderr: AsyncIterable<Uint8Array> | null
) {
    if (!stderr) return;
    (async () => {
        const decoder = new TextDecoder();
        for await (const chunk of stderr) {
            const text = decoder.decode(chunk);
            if (text.includes("Loaded cached credentials.")) continue;
            console.error(`[Gemini CLI Error] ${text}`);
        }
    })();
}

/**
 * 工具模式：緩衝完整回應後判斷是否為 TOOL_CALL，
 * 再以對應的 SSE 格式回傳。
 */
export async function handleToolStream(
    stdout: AsyncIterable<Uint8Array>,
    stream: { write: (data: string) => any },
    modelName: string
) {
    const decoder = new TextDecoder();
    let accumulatedContent = '';

    for await (const chunk of stdout) {
        const text = decoder.decode(chunk, { stream: true });
        for (const line of splitLines(text)) {
            try {
                const event = JSON.parse(line);
                if (event.type === 'message' && event.role === 'assistant' && event.content) {
                    accumulatedContent += event.content;
                } else if (event.type === 'result') {
                    await flushToolOrText(stream, accumulatedContent.trim(), modelName);
                }
            } catch {
                console.warn(`[Stream] Failed to parse JSON: ${line}`);
            }
        }
    }
}

/**
 * 純文字串流模式：邊收邊送，達到即時串流效果。
 */
export async function handleTextStream(
    stdout: AsyncIterable<Uint8Array>,
    stream: { write: (data: string) => any },
    modelName: string
) {
    const decoder = new TextDecoder();

    for await (const chunk of stdout) {
        const text = decoder.decode(chunk, { stream: true });
        for (const line of splitLines(text)) {
            try {
                const event = JSON.parse(line);
                if (event.type === 'message' && event.role === 'assistant' && event.content) {
                    await stream.write(toSSEChunk(event.content, modelName));
                } else if (event.type === 'result') {
                    await stream.write(toSSEChunk("", modelName, "stop"));
                    await stream.write("data: [DONE]\n\n");
                }
            } catch {
                console.warn(`[Stream] Failed to parse JSON: ${line}`);
            }
        }
    }
}

/** 決定要發送 tool_call SSE 還是純文字 SSE */
export async function flushToolOrText(
    stream: { write: (data: string) => any },
    fullContent: string,
    modelName: string
) {
    const toolCallIndex = fullContent.indexOf(TOOL_CALL_PREFIX);
    if (toolCallIndex !== -1) {
        const toolCallStr = fullContent.slice(toolCallIndex);
        console.log(`[ToolCall] Detected: ${toolCallStr.substring(0, 80)}...`);
        await sendToolCallSSE(stream, toolCallStr, modelName);
    } else {
        if (fullContent) await stream.write(toSSEChunk(fullContent, modelName));
        await stream.write(toSSEChunk("", modelName, "stop"));
        await stream.write("data: [DONE]\n\n");
    }
}

/** 將 chunk 文字切行，並過濾空行 */
export function splitLines(text: string): string[] {
    return text.split('\n').filter(l => l.trim() !== '');
}

/**
 * 非串流模式：收集 gemini CLI 的完整回應文字並回傳。
 * 不送任何 SSE，由呼叫端決定如何包裝成 JSON。
 */
export async function collectStreamedContent(
    stdout: AsyncIterable<Uint8Array>
): Promise<string> {
    const decoder = new TextDecoder();
    let accumulated = '';

    for await (const chunk of stdout) {
        const text = decoder.decode(chunk, { stream: true });
        for (const line of splitLines(text)) {
            try {
                const event = JSON.parse(line);
                if (event.type === 'message' && event.role === 'assistant' && event.content) {
                    accumulated += event.content;
                }
            } catch {
                console.warn(`[NonStream] Failed to parse JSON: ${line}`);
            }
        }
    }

    return accumulated.trim();
}

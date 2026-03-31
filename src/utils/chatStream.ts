import { toSSEChunk, sendToolCallSSE, TOOL_CALL_PREFIX } from "./sseFormatter";
import { logger } from "./logger";

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
            logger.warn('Gemini CLI stderr', { text: text.trim() });
        }
    })();
}

/**
 * 工具模式：緩衝完整回應後判斷是否為 TOOL_CALL，
 * 再以對應的 SSE 格式回傳。回傳累計的純文字內容。
 */
export async function handleToolStream(
    stdout: AsyncIterable<Uint8Array>,
    stream: { write: (data: string) => any },
    modelName: string
): Promise<string> {
    const decoder = new TextDecoder();
    let accumulatedContent = '';
    let buffer = '';

    for await (const chunk of stdout) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // 最後一行如果不完整，留在 buffer 中

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
                const event = JSON.parse(trimmed);
                if (event.type === 'message' && event.role === 'assistant' && event.content) {
                    accumulatedContent += event.content;
                } else if (event.type === 'result') {
                    await flushToolOrText(stream, accumulatedContent.trim(), modelName);
                }
            } catch {
                logger.warn('Stream(Tool): failed to parse JSON', { line: trimmed.slice(0, 100) });
            }
        }
    }
    return accumulatedContent.trim();
}

/**
 * 純文字串流模式：邊收邊送，達到即時串流效果。回傳累計的純文字內容。
 */
export async function handleTextStream(
    stdout: AsyncIterable<Uint8Array>,
    stream: { write: (data: string) => any },
    modelName: string
): Promise<string> {
    const decoder = new TextDecoder();
    let accumulatedContent = '';
    let buffer = '';

    for await (const chunk of stdout) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
                const event = JSON.parse(trimmed);
                if (event.type === 'message' && event.role === 'assistant' && event.content) {
                    accumulatedContent += event.content;
                    await stream.write(toSSEChunk(event.content, modelName));
                } else if (event.type === 'result') {
                    await stream.write(toSSEChunk("", modelName, "stop"));
                    await stream.write("data: [DONE]\n\n");
                }
            } catch {
                logger.warn('Stream(Text): failed to parse JSON', { line: trimmed.slice(0, 100) });
            }
        }
    }
    return accumulatedContent.trim();
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
        logger.info('ToolCall detected', { preview: toolCallStr.substring(0, 80) });
        await sendToolCallSSE(stream, toolCallStr, modelName);
    } else {
        if (fullContent) await stream.write(toSSEChunk(fullContent, modelName));
        await stream.write(toSSEChunk("", modelName, "stop"));
        await stream.write("data: [DONE]\n\n");
    }
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
    let buffer = '';

    for await (const chunk of stdout) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
                const event = JSON.parse(trimmed);
                if (event.type === 'message' && event.role === 'assistant' && event.content) {
                    accumulated += event.content;
                }
            } catch {
                logger.warn('NonStream: failed to parse JSON', { line: trimmed });
            }
        }
    }

    return accumulated.trim();
}

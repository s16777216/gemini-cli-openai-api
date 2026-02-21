const TOOL_CALL_PREFIX = 'TOOL_CALL:';

/** 將文字內容包裝成 OpenAI SSE chunk 格式 */
export function toSSEChunk(content: string, model: string, finish_reason: string | null = null): string {
    const chunk = {
        id: `chatcmpl-${Date.now()}`,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [{
            index: 0,
            delta: finish_reason ? {} : { content },
            finish_reason,
        }],
    };
    return `data: ${JSON.stringify(chunk)}\n\n`;
}

/** 發送 OpenAI tool_calls SSE 格式 */
export async function sendToolCallSSE(stream: { write: (data: string) => any }, toolCallLine: string, modelName: string): Promise<void> {
    let toolCall: { name: string; arguments: any };
    try {
        toolCall = JSON.parse(toolCallLine.slice(TOOL_CALL_PREFIX.length).trim());
    } catch (e) {
        console.warn('[ToolCall] Failed to parse tool call JSON:', toolCallLine);
        await stream.write(toSSEChunk(toolCallLine, modelName));
        await stream.write(toSSEChunk("", modelName, "stop"));
        await stream.write("data: [DONE]\n\n");
        return;
    }

    const callId = `call_${Date.now()}`;
    const argsStr = typeof toolCall.arguments === 'string'
        ? toolCall.arguments
        : JSON.stringify(toolCall.arguments);

    // Chunk 1: 宣告 tool call（id + name）
    await stream.write(`data: ${JSON.stringify({
        id: `chatcmpl-${Date.now()}`,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: modelName,
        choices: [{
            index: 0,
            delta: {
                role: "assistant",
                content: null,
                tool_calls: [{
                    index: 0,
                    id: callId,
                    type: "function",
                    function: { name: toolCall.name, arguments: "" }
                }]
            },
            finish_reason: null
        }]
    })}\n\n`);

    // Chunk 2: arguments 內容
    await stream.write(`data: ${JSON.stringify({
        id: `chatcmpl-${Date.now()}`,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: modelName,
        choices: [{
            index: 0,
            delta: { tool_calls: [{ index: 0, function: { arguments: argsStr } }] },
            finish_reason: null
        }]
    })}\n\n`);

    // Chunk 3: finish_reason = tool_calls
    await stream.write(`data: ${JSON.stringify({
        id: `chatcmpl-${Date.now()}`,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: modelName,
        choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }]
    })}\n\n`);

    await stream.write("data: [DONE]\n\n");
}

/** 建構非串流的純文字 JSON 回應（OpenAI chat.completion 格式） */
export function buildNonStreamResponse(content: string, modelName: string, finishReason = 'stop') {
    return {
        id: `chatcmpl-${Date.now()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: modelName,
        choices: [{
            index: 0,
            message: { role: "assistant", content },
            finish_reason: finishReason,
        }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    };
}

/** 建構非串流的 tool_calls JSON 回應 */
export function buildToolCallNonStreamResponse(toolCallLine: string, modelName: string) {
    let toolCall: { name: string; arguments: any };
    try {
        toolCall = JSON.parse(toolCallLine.slice(TOOL_CALL_PREFIX.length).trim());
    } catch {
        console.warn('[ToolCall] Failed to parse non-stream tool call JSON:', toolCallLine);
        return buildNonStreamResponse(toolCallLine, modelName);
    }

    const callId = `call_${Date.now()}`;
    const argsStr = typeof toolCall.arguments === 'string'
        ? toolCall.arguments
        : JSON.stringify(toolCall.arguments);

    return {
        id: `chatcmpl-${Date.now()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: modelName,
        choices: [{
            index: 0,
            message: {
                role: "assistant",
                content: null,
                tool_calls: [{
                    id: callId,
                    type: "function",
                    function: { name: toolCall.name, arguments: argsStr },
                }],
            },
            finish_reason: "tool_calls",
        }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    };
}

export { TOOL_CALL_PREFIX };

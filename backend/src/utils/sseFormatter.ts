import { logger } from "./logger";
import { z } from "zod";

export const ToolCallArraySchema = z.array(
    z.object({
        name: z.string(),
        arguments: z.any()
    })
);

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

/** 發送 OpenAI tool_calls SSE 格式 (支援陣列多重呼叫) */
export async function sendToolCallSSE(stream: { write: (data: string) => any }, jsonArrayStr: string, modelName: string): Promise<void> {
    let toolCalls: z.infer<typeof ToolCallArraySchema>;
    try {
        const parsed = JSON.parse(jsonArrayStr);
        toolCalls = ToolCallArraySchema.parse(parsed);
    } catch (e) {
        logger.warn('ToolCall: failed to parse tool call JSON array (SSE)', { raw: jsonArrayStr.slice(0, 120), error: e });
        await stream.write(toSSEChunk(jsonArrayStr, modelName));
        await stream.write(toSSEChunk("", modelName, "stop"));
        await stream.write("data: [DONE]\n\n");
        return;
    }

    const streamToolCalls = toolCalls.map((tc, index) => {
        return {
            index,
            id: `call_${Date.now()}_${index}`,
            type: "function",
            function: {
                name: tc.name,
                arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments)
            }
        };
    });

    for (const tc of streamToolCalls) {
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
                    tool_calls: [{
                        index: tc.index,
                        id: tc.id,
                        type: "function",
                        function: { name: tc.function.name, arguments: "" }
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
                delta: { tool_calls: [{ index: tc.index, function: { arguments: tc.function.arguments } }] },
                finish_reason: null
            }]
        })}\n\n`);
    }

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
export function buildToolCallNonStreamResponse(jsonArrayStr: string, modelName: string) {
    let toolCalls: z.infer<typeof ToolCallArraySchema>;
    try {
        const parsed = JSON.parse(jsonArrayStr);
        toolCalls = ToolCallArraySchema.parse(parsed);
    } catch {
        logger.warn('ToolCall: failed to parse non-stream tool call JSON', { raw: jsonArrayStr.slice(0, 120) });
        return buildNonStreamResponse(jsonArrayStr, modelName);
    }

    const tcs = toolCalls.map((tc, index) => ({
        id: `call_${Date.now()}_${index}`,
        type: "function",
        function: {
            name: tc.name,
            arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments)
        }
    }));

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
                tool_calls: tcs,
            },
            finish_reason: "tool_calls",
        }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    };
}

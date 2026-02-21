import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { stream } from "hono/streaming";
import { ChatCompletionSchema, type Message } from "../schemas/chat";
import { GeminiArgument } from "../services/gemini";
import { flattenMessages, buildPromptWithTools } from "../utils/promptBuilder";
import { toSSEChunk, sendToolCallSSE, TOOL_CALL_PREFIX } from "../utils/sseFormatter";
import { config } from "../config";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HonoStream = Parameters<Parameters<typeof stream>[1]>[0];

// ── 型別 ────────────────────────────────────────────────────────────────────

interface GeminiProcess {
    stdout: AsyncIterable<Uint8Array> | null;
    stderr: AsyncIterable<Uint8Array> | null;
    exited: Promise<number>;
}

// ── 子函式 ──────────────────────────────────────────────────────────────────

/** 將 gemini CLI 的 stderr 輸出轉到 console（過濾憑證提示） */
function pipeStderr(proc: GeminiProcess) {
    if (!proc.stderr) return;
    (async () => {
        const decoder = new TextDecoder();
        for await (const chunk of proc.stderr!) {
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
async function handleToolStream(
    proc: GeminiProcess,
    stream: HonoStream,
    modelName: string
) {
    if (!proc.stdout) return;
    const decoder = new TextDecoder();
    let accumulatedContent = '';

    for await (const chunk of proc.stdout) {
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
async function handleTextStream(
    proc: GeminiProcess,
    stream: HonoStream,
    modelName: string
) {
    if (!proc.stdout) return;
    const decoder = new TextDecoder();

    for await (const chunk of proc.stdout) {
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
async function flushToolOrText(stream: HonoStream, fullContent: string, modelName: string) {
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
function splitLines(text: string): string[] {
    return text.split('\n').filter(l => l.trim() !== '');
}

// ── 主要 Handler ─────────────────────────────────────────────────────────────

export default async function ChatCompletions(context: Context) {
    const body = await context.req.json();
    const result = ChatCompletionSchema.safeParse(body);

    if (!result.success) {
        console.warn(`[Request] Invalid request body: ${JSON.stringify(body)}`);
        throw new HTTPException(400, {
            message: "Invalid request body",
            cause: result.error
        });
    }

    const { messages, stream: isStream, model, tools } = result.data as any;
    const hasTools = Array.isArray(tools) && tools.length > 0;
    const modelName = model ?? config.defaultModel;

    const flatText = flattenMessages(messages as Message[]);
    const prompt = hasTools ? buildPromptWithTools(flatText, tools) : flatText;

    console.log(`[Request] Stream: ${isStream}, Prompt: ${prompt.length} chars, Tools: ${hasTools ? tools.length : 0}`);

    const geminiArg = new GeminiArgument(prompt, modelName);
    const command = await geminiArg.toCommand();
    const proc = Bun.spawn(["pwsh", "-Command", command.join(" ")], {
        stdout: "pipe",
        stderr: "pipe",
    });

    context.header("Content-Type", "text/event-stream; charset=utf-8");
    context.header("Cache-Control", "no-cache");
    context.header("Connection", "keep-alive");
    context.header("X-Accel-Buffering", "no");

    return stream(context, async (s) => {
        pipeStderr(proc);

        if (hasTools) {
            await handleToolStream(proc, s, modelName);
        } else {
            await handleTextStream(proc, s, modelName);
        }

        const exitCode = await proc.exited;
        console.log(`[Process] Gemini CLI exited with code: ${exitCode}`);
        await geminiArg.cleanTempFile();
    });
}

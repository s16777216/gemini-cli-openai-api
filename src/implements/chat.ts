import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { stream } from "hono/streaming";
import { ChatCompletionSchema, type Message } from "../schemas/chat";
import { GeminiArgument } from "../services/gemini";
import { flattenMessages, buildPromptWithTools } from "../utils/promptBuilder";
import { toSSEChunk, sendToolCallSSE, TOOL_CALL_PREFIX } from "../utils/sseFormatter";
import { config } from "../config";

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

    const flatText = flattenMessages(messages as Message[]);
    const prompt = hasTools ? buildPromptWithTools(flatText, tools) : flatText;
    const modelName = model ?? config.defaultModel;

    console.log(`[Request] Stream: ${isStream}, Prompt length: ${prompt.length}, Tools: ${hasTools ? tools.length : 0}`);

    const geminiArg = new GeminiArgument(prompt, modelName);
    const command = await geminiArg.toCommand();

    const proc = Bun.spawn([
        "pwsh", "-Command", command.join(" ")
    ], { stdout: "pipe", stderr: "pipe" });

    context.header("Content-Type", "text/event-stream; charset=utf-8");
    context.header("Cache-Control", "no-cache");
    context.header("Connection", "keep-alive");
    context.header("X-Accel-Buffering", "no");

    const res = stream(context, async (stream) => {
        const decoder = new TextDecoder();

        if (proc.stderr) {
            (async () => {
                for await (const chunk of proc.stderr) {
                    const errorText = decoder.decode(chunk);
                    if (errorText.includes("Loaded cached credentials.")) continue;
                    console.error(`[Gemini CLI Error] ${errorText}`);
                }
            })();
        }

        if (proc.stdout) {
            if (hasTools) {
                // ── 工具模式：緩衝完整回應，再判斷是否為 tool_call ──
                let accumulatedContent = '';

                for await (const chunk of proc.stdout) {
                    const text = decoder.decode(chunk, { stream: true });
                    const lines = text.split('\n').filter(l => l.trim() !== '');

                    for (const line of lines) {
                        try {
                            const event = JSON.parse(line);
                            if (event.type === 'message' && event.role === 'assistant' && event.content) {
                                accumulatedContent += event.content;
                            } else if (event.type === 'result') {
                                const fullContent = accumulatedContent.trim();
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
                        } catch (e) {
                            console.warn(`[Stream] Failed to parse JSON: ${line}`);
                        }
                    }
                }
            } else {
                // ── 純文字串流模式 ──
                for await (const chunk of proc.stdout) {
                    const text = decoder.decode(chunk, { stream: true });
                    const lines = text.split('\n').filter(l => l.trim() !== '');

                    for (const line of lines) {
                        try {
                            const event = JSON.parse(line);
                            if (event.type === 'message' && event.role === 'assistant' && event.content) {
                                await stream.write(toSSEChunk(event.content, modelName));
                            } else if (event.type === 'result') {
                                await stream.write(toSSEChunk("", modelName, "stop"));
                                await stream.write("data: [DONE]\n\n");
                            }
                        } catch (e) {
                            console.warn(`[Stream] Failed to parse JSON: ${line}`);
                        }
                    }
                }
            }
        }

        const exitCode = await proc.exited;
        console.log(`[Process] Gemini CLI exited with code: ${exitCode}`);
        await geminiArg.cleanTempFile();
    });

    return res;
}

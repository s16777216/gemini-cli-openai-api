import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { stream } from "hono/streaming";
import { ChatCompletionSchema, type Message } from "../schemas/chat";
import { GeminiArgument } from "../services/gemini";
import { flattenMessages, buildPromptWithTools } from "../utils/promptBuilder";
import { handleToolStream, handleTextStream, pipeStderr, collectStreamedContent } from "../utils/chatStream";
import { buildNonStreamResponse, buildToolCallNonStreamResponse, TOOL_CALL_PREFIX } from "../utils/sseFormatter";
import { config } from "../config";
import { logger } from "../utils/logger";

export default async function ChatCompletions(context: Context) {
    const body = await context.req.json();
    const result = ChatCompletionSchema.safeParse(body);

    if (!result.success) {
        logger.warn('Invalid request body', { body: JSON.stringify(body).slice(0, 200) });
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

    logger.info('Incoming request', { stream: isStream, promptLen: prompt.length, tools: hasTools ? tools.length : 0, model: modelName });

    const geminiArg = new GeminiArgument(prompt, modelName);
    const command = await geminiArg.toCommand();
    const proc = Bun.spawn(["pwsh", "-Command", command.join(" ")], {
        stdout: "pipe",
        stderr: "pipe",
    });

    pipeStderr(proc.stderr);

    // ── 非串流模式（stream: false） ────────────────────────────────────────
    if (!isStream) {
        try {
            const content = proc.stdout
                ? await collectStreamedContent(proc.stdout)
                : '';

            await proc.exited;
            await geminiArg.cleanTempFile();

            // gemini 回傳空內容時不能將空字串送回客戶端（opencode 會拒絕）
            if (!content) {
                throw new HTTPException(502, { message: "Gemini returned an empty response. Please try again." });
            }

            const toolCallIndex = content.indexOf(TOOL_CALL_PREFIX);
            if (hasTools && toolCallIndex !== -1) {
                return context.json(buildToolCallNonStreamResponse(content.slice(toolCallIndex), modelName));
            }
            return context.json(buildNonStreamResponse(content, modelName));
        } catch (err) {
            await geminiArg.cleanTempFile();
            if (err instanceof HTTPException) throw err;
            throw new HTTPException(500, { message: "Gemini CLI error", cause: err });
        }
    }

    // ── 串流模式（stream: true 或預設） ───────────────────────────────────
    context.header("Content-Type", "text/event-stream; charset=utf-8");
    context.header("Cache-Control", "no-cache");
    context.header("Connection", "keep-alive");
    context.header("X-Accel-Buffering", "no");

    return stream(context, async (s) => {
        if (proc.stdout) {
            if (hasTools) {
                await handleToolStream(proc.stdout, s, modelName);
            } else {
                await handleTextStream(proc.stdout, s, modelName);
            }
        }

        await proc.exited;
        await geminiArg.cleanTempFile();
    });
}

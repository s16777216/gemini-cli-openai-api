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
import { SessionRepository } from "../repositories/sessionRepository";

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

    const { messages, stream: isStream, model, tools, sessionId: reqSessionId } = result.data as any;
    const hasTools = Array.isArray(tools) && tools.length > 0;
    const modelName = model ?? config.defaultModel;

    const sessionRepo = SessionRepository.getInstance();
    let sessionId = reqSessionId;

    // 如果沒有 sessionId，建立一個新的
    if (!sessionId) {
        sessionId = crypto.randomUUID();
        const firstMsg = messages[0]?.content || 'New Chat';
        const title = typeof firstMsg === 'string' ? firstMsg.slice(0, 20) : 'New Chat';
        sessionRepo.upsert({
            id: sessionId,
            title,
            model: modelName,
            updatedAt: Date.now()
        });
    }

    // 儲存使用者訊息
    const lastUserMsg = messages[messages.length - 1];
    if (lastUserMsg) {
        sessionRepo.addMessage({
            sessionId,
            role: 'user',
            content: typeof lastUserMsg.content === 'string' ? lastUserMsg.content : JSON.stringify(lastUserMsg.content),
            createdAt: Date.now()
        });
    }

    const flatText = flattenMessages(messages as Message[]);
    const prompt = hasTools ? buildPromptWithTools(flatText, tools) : flatText;

    logger.info('Incoming request', { stream: isStream, promptLen: prompt.length, tools: hasTools ? tools.length : 0, model: modelName, sessionId });

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

            if (!content) {
                throw new HTTPException(502, { message: "Gemini returned an empty response. Please try again." });
            }

            // 儲存 AI 回應
            sessionRepo.addMessage({
                sessionId,
                role: 'ai',
                content,
                createdAt: Date.now()
            });

            const toolCallIndex = content.indexOf(TOOL_CALL_PREFIX);
            const response = hasTools && toolCallIndex !== -1
                ? context.json(buildToolCallNonStreamResponse(content.slice(toolCallIndex), modelName))
                : context.json(buildNonStreamResponse(content, modelName));

            response.headers.set('x-session-id', sessionId);
            return response;
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
    context.header("x-session-id", sessionId);

    return stream(context, async (s) => {
        let fullAiContent = '';
        if (proc.stdout) {
            if (hasTools) {
                fullAiContent = await handleToolStream(proc.stdout, s, modelName);
            } else {
                fullAiContent = await handleTextStream(proc.stdout, s, modelName);
            }
        }

        await proc.exited;
        await geminiArg.cleanTempFile();

        if (fullAiContent) {
            sessionRepo.addMessage({
                sessionId,
                role: 'ai',
                content: fullAiContent,
                createdAt: Date.now()
            });
        }
    });
}

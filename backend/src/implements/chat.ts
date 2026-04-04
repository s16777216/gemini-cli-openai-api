import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { stream } from "hono/streaming";
import { ChatCompletionSchema, type Message } from "../schemas/chat";
import { GeminiArgument } from "../services/gemini";
import { flattenMessages, buildPromptWithTools } from "../utils/promptBuilder";
import { handleStream, pipeStderr, collectStreamedContent } from "../utils/chatStream";
import { buildNonStreamResponse, buildToolCallNonStreamResponse } from "../utils/sseFormatter";
import { config } from "../config";
import { logger } from "../utils/logger";
import { SessionRepository } from "../repositories/sessionRepository";
import crypto from "node:crypto";

export default async function ChatCompletions(context: Context) {
    const startTime = performance.now();
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

    const requestId = crypto.randomUUID().slice(0, 8);
    const flatText = flattenMessages(messages as Message[]);
    const prompt = hasTools ? buildPromptWithTools(flatText, tools) : flatText;

    const geminiArg = new GeminiArgument(prompt, modelName);
    let commandArgs: string[] = [];

    if (config.geminiCliPath.startsWith("npx")) {
        // 處理 npx 指令模式
        const parts = config.geminiCliPath.split(" ");
        const bin = await Bun.which(parts[0] || "npx");
        if (bin) {
            parts[0] = bin;
        }
        commandArgs = [...parts, ...geminiArg.toArgs()];
    } else {
        // 處理直接腳本路徑模式
        commandArgs = ["node", config.geminiCliPath, ...geminiArg.toArgs()];
    }
    
    logger.info('Incoming request', { requestId, stream: isStream, promptLen: prompt.length, tools: hasTools ? tools.length : 0, model: modelName, sessionId });
    
    const spawnStart = performance.now();
    const proc = Bun.spawn(commandArgs, {
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
        env: {
            ...Bun.env,
            NO_UPDATE_CHECK: "1",
            GEMINI_CLI_SKIP_UPDATE: "1"
        }
    });

    // 透過 stdin 傳遞 prompt
    if (proc.stdin) {
        proc.stdin.write(prompt);
        proc.stdin.end();
    }

    const spawnDuration = (performance.now() - spawnStart).toFixed(2);
    console.log(`[Perf] Process spawned: ${spawnDuration}ms`);

    // 監聽連線中斷，主動殺掉進程
    context.req.raw.signal.addEventListener('abort', () => {
        if (proc.killed === false) {
            logger.warn('Client disconnected, killing process', { requestId });
            proc.kill();
        }
    });

    pipeStderr(proc.stderr);

    // ── 非串流模式（stream: false） ────────────────────────────────────────
    if (!isStream) {
        try {
            const content = proc.stdout
                ? await collectStreamedContent(proc.stdout, startTime)
                : '';

            await proc.exited;

            if (content) {
                // 儲存 AI 回應
                sessionRepo.addMessage({
                    sessionId,
                    role: 'ai',
                    content,
                    createdAt: Date.now()
                });
            } else {
                if (proc.exitCode !== 0) {
                    throw new HTTPException(500, { message: `Gemini CLI failed with exit code ${proc.exitCode}` });
                }
                throw new HTTPException(502, { message: "Gemini returned an empty response. Please try again." });
            }

            const startTag = '<tool_calls>';
            const endTag = '</tool_calls>';
            const toolCallIndex = content.indexOf(startTag);
            
            let response;
            if (hasTools && toolCallIndex !== -1) {
                const endIndex = content.lastIndexOf(endTag);
                let jsonStr = '';
                if (endIndex !== -1 && endIndex > toolCallIndex) {
                    jsonStr = content.substring(toolCallIndex + startTag.length, endIndex).trim();
                } else {
                    jsonStr = content.substring(toolCallIndex + startTag.length).trim();
                }
                response = context.json(buildToolCallNonStreamResponse(jsonStr, modelName));
            } else {
                response = context.json(buildNonStreamResponse(content, modelName));
            }

            response.headers.set('x-session-id', sessionId);
            return response;
        } catch (err) {
            if (proc.killed === false) proc.kill();
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
        try {
            if (proc.stdout) {
                fullAiContent = await handleStream(proc.stdout, s, modelName, startTime, hasTools);
            }

            await proc.exited;

            if (fullAiContent) {
                sessionRepo.addMessage({
                    sessionId,
                    role: 'ai',
                    content: fullAiContent,
                    createdAt: Date.now()
                });
            }
        } catch (err) {
            if (proc.killed === false) proc.kill();
            logger.error('Streaming error', { requestId, error: String(err) });
        }
    });
}

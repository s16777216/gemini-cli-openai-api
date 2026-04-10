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

import { LoadBalancerService } from "../services/loadBalancerService";
import { toGeminiContents } from "../utils/geminiFormatter";
import { handleApiStream } from "../utils/apiStreamHandler";

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

    // session management
    if (!sessionId) {
        sessionId = crypto.randomUUID();
        const firstMsg = messages[0]?.content || 'New Chat';
        const title = typeof firstMsg === 'string' ? firstMsg.slice(0, 20) : 'New Chat';
        sessionRepo.upsert({ id: sessionId, title, model: modelName, updatedAt: Date.now() });
    }

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
    logger.info('Incoming request', { requestId, stream: isStream, model: modelName, sessionId });

    // ── 第 1 步：嘗試取得負載均衡的上游 Provider ──────────────────────────
    const lb = LoadBalancerService.getInstance();
    const upstream = await lb.getProvider();

    if (upstream) {
        // 使用直接 API 模式 (更快、更穩定)
        const { provider, credentialId } = upstream;
        const contents = toGeminiContents(messages);

        try {
            const apiResponseStream = await provider.streamGenerateContent(modelName, contents, {
                temperature: result.data.temperature,
                max_tokens: result.data.max_tokens,
                stop: result.data.stop
            });

            if (isStream) {
                context.header("Content-Type", "text/event-stream; charset=utf-8");
                context.header("x-session-id", sessionId);
                return stream(context, async (s) => {
                    const fullAiContent = await handleApiStream(apiResponseStream, s, modelName, startTime);
                    if (fullAiContent) {
                        sessionRepo.addMessage({ sessionId, role: 'ai', content: fullAiContent, createdAt: Date.now() });
                    }
                });
            } else {
                // TODO: Implement non-stream collection for API Provider
                // For now, let's keep it simple
                throw new Error("Non-stream for API provider not fully implemented in POC");
            }
        } catch (e: any) {
            logger.error('API Provider error, falling back to CLI', { requestId, error: e.message });
            if (e.message.includes("429")) {
                lb.markRateLimited(credentialId);
            }
            // Fallback continues to CLI below
        }
    }

    // ── 第 2 步：Fallback 到 CLI 模式 (舊有邏輯) ───────────────────────────
    const flatText = flattenMessages(messages as Message[]);
    const prompt = hasTools ? buildPromptWithTools(flatText, tools) : flatText;

    const geminiArg = new GeminiArgument(prompt, modelName);
    let commandArgs: string[] = [];

    if (config.geminiCliPath.startsWith("npx")) {
        const parts = config.geminiCliPath.split(" ");
        const bin = await Bun.which(parts[0] || "npx");
        if (bin) parts[0] = bin;
        commandArgs = [...parts, ...geminiArg.toArgs()];
    } else {
        commandArgs = ["node", config.geminiCliPath, ...geminiArg.toArgs()];
    }

    const proc = Bun.spawn(commandArgs, {
        stdin: "pipe", stdout: "pipe", stderr: "pipe",
        env: { ...Bun.env, NO_UPDATE_CHECK: "1", GEMINI_CLI_SKIP_UPDATE: "1" }
    });

    if (proc.stdin) {
        proc.stdin.write(prompt);
        proc.stdin.end();
    }

    context.req.raw.signal.addEventListener('abort', () => { if (proc.killed === false) proc.kill(); });
    pipeStderr(proc.stderr);

    if (!isStream) {
        const content = proc.stdout ? await collectStreamedContent(proc.stdout, startTime) : '';
        await proc.exited;
        if (content) {
            sessionRepo.addMessage({ sessionId, role: 'ai', content, createdAt: Date.now() });
        }
        return context.json(buildNonStreamResponse(content, modelName));
    }

    context.header("Content-Type", "text/event-stream; charset=utf-8");
    context.header("x-session-id", sessionId);

    return stream(context, async (s) => {
        let fullAiContent = '';
        if (proc.stdout) fullAiContent = await handleStream(proc.stdout, s, modelName, startTime, hasTools);
        await proc.exited;
        if (fullAiContent) {
            sessionRepo.addMessage({ sessionId, role: 'ai', content: fullAiContent, createdAt: Date.now() });
        }
    });
}


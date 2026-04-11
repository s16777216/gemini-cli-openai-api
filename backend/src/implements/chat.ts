import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { stream } from "hono/streaming";
import { ChatCompletionSchema, type Message } from "../schemas/chat";
import { buildNonStreamResponse } from "../utils/sseFormatter";
import { config } from "../config";
import { logger } from "../utils/logger";
import { SessionRepository } from "../repositories/sessionRepository";
import { RequestLogRepository } from "../repositories/requestLogRepository";
import crypto from "node:crypto";

import { LoadBalancerService } from "../services/loadBalancerService";
import { toGeminiContents } from "../utils/geminiFormatter";
import { handleApiStream } from "../utils/apiStreamHandler";
import { parseGoogleError } from "../utils/googleErrorParser";

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

    const { messages, stream: isStream, model, tools, sessionId: reqSessionId } = body;
    const hasTools = Array.isArray(tools) && tools.length > 0;
    const modelName = model ?? config.defaultModel;

    // 智慧持久化判斷：只有當 Payload 中包含 sessionId 欄位時（即使為 null）才視為 WebUI 請求並存檔
    const isPersistenceEnabled = 'sessionId' in body;
    const sessionRepo = SessionRepository.getInstance();
    let sessionId = reqSessionId;

    if (isPersistenceEnabled) {
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
    }

    const requestId = crypto.randomUUID().slice(0, 8);
    logger.info('Incoming request', { requestId, stream: isStream, model: modelName, sessionId, persistence: isPersistenceEnabled });

    const lb = LoadBalancerService.getInstance();
    const contents = toGeminiContents(messages);

    // ── 自動重試迴圈：直到找到可用帳號或全數試過為止 ───────────────────
    while (true) {
        const upstream = await lb.getProvider();

        if (!upstream) {
            logger.error('No providers available', { requestId });
            throw new HTTPException(503, { 
                message: "No active Google Gemini accounts available. All accounts may be currently rate limited. Please try again later." 
            });
        }

        const { provider, credentialId, label } = upstream;
        const apiRequestStartTime = Date.now();

        try {
            const { stream: apiResponseStream, status: statusCode } = await provider.streamGenerateContent(modelName, contents, {
                temperature: result.data.temperature,
                max_tokens: result.data.max_tokens,
                stop: result.data.stop
            });

            // 記錄成功日誌
            RequestLogRepository.getInstance().add({
                upstreamId: credentialId,
                model: modelName,
                statusCode: statusCode,
                latency: Date.now() - apiRequestStartTime,
                createdAt: apiRequestStartTime
            });

            if (isStream) {
                context.header("Content-Type", "text/event-stream; charset=utf-8");
                if (sessionId) context.header("x-session-id", sessionId);
                
                return stream(context, async (s) => {
                    const fullAiContent = await handleApiStream(apiResponseStream, s, modelName, startTime);
                    if (fullAiContent && isPersistenceEnabled) {
                        sessionRepo.addMessage({ sessionId, role: 'ai', content: fullAiContent, createdAt: Date.now() });
                    }
                });
            } else {
                // 目前版本僅支援串流模式
                throw new HTTPException(501, { message: "Non-stream mode for API provider not implemented." });
            }
        } catch (e: any) {
            const errorResult = parseGoogleError(e.message);
            const statusCode = e.status || 500;
            const latency = Date.now() - (typeof apiRequestStartTime !== 'undefined' ? apiRequestStartTime : Date.now());

            // 記錄錯誤日誌
            RequestLogRepository.getInstance().add({
                upstreamId: credentialId,
                model: modelName,
                statusCode: statusCode,
                latency: latency,
                error: errorResult.originalMessage,
                createdAt: Date.now()
            });
            
            if (errorResult.isRateLimit) {
                logger.warn(`Provider "${label}" (${credentialId}) rate limited. Retrying with another provider...`, { 
                    requestId, 
                    retryAfter: errorResult.retryAfterSeconds 
                });
                lb.markRateLimited(credentialId, errorResult.retryAfterSeconds);
                continue; // 進入下一輪迴圈嘗試下一個帳號
            }

            // 致命錯誤（非 429），直接拋出
            logger.error(`API Provider fatal error on "${label}" (${credentialId})`, { requestId, error: errorResult.originalMessage });
            throw new HTTPException(502, { message: `Upstream "${label}" error: ${errorResult.originalMessage}` });
        }
    }
}


import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import { verify } from "hono/jwt";
import { config } from "../config";
import { logger } from "./logger";
import { ApiKeyRepository } from "../repositories/apiKeyRepository";

const repo = ApiKeyRepository.getInstance();

/**
 * API Key 驗證中間件。
 * 支援管理員 JWT 或 持久化 API Key。
 */
export async function authMiddleware(c: Context, next: Next) {
    const authHeader = c.req.header("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        throw new HTTPException(401, { message: "Unauthorized: Missing Bearer token" });
    }

    const providedKey = authHeader.slice(7).trim();

    // 1. 嘗試 JWT 驗證 (管理員或動態 Key)
    try {
        await verify(providedKey, config.jwtSecret, "HS256");
        return await next();
    } catch (e) {
        // JWT 驗證失敗，繼續嘗試檢查持久化 Key
    }

    // 2. 嘗試持久化 API Key 驗證
    const apiKeyRecord = repo.findByToken(providedKey);
    if (apiKeyRecord && apiKeyRecord.status === 'active') {
        return await next();
    }

    logger.warn("Authentication failed: Invalid Key or JWT Signature");
    throw new HTTPException(401, { message: "Unauthorized: Invalid API Key" });
}

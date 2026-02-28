import type { Context } from "hono";
import { ApiKeyRepository } from "../repositories/apiKeyRepository";
import { logger } from "../utils/logger";
import { randomUUID } from "node:crypto";

const repo = ApiKeyRepository.getInstance();

/**
 * 獲取所有 API Key 列表
 */
export async function ListKeys(c: Context) {
    const keys = repo.findAll();
    return c.json({ data: keys });
}

/**
 * 建立新的 API Key
 */
export async function CreateKey(c: Context) {
    try {
        const { label } = await c.req.json();

        const id = randomUUID();
        const token = `sk-${randomUUID().replace(/-/g, '')}`;

        const newKey = {
            id,
            token,
            label: label || "New Key",
            status: 'active' as const,
            createdAt: Date.now()
        };

        repo.add(newKey);
        logger.info("New API Key created", { id, label });

        return c.json(newKey);
    } catch (e) {
        logger.error("Create API Key failed", { error: String(e) });
        return c.json({ message: "Invalid request" }, 400);
    }
}

/**
 * 撤銷 API Key
 */
export async function RevokeKey(c: Context) {
    const id = c.req.param("id");

    const success = repo.updateStatus(id, 'revoked');

    if (success) {
        logger.info("API Key revoked", { id });
        return c.json({ message: "Key revoked successfully" });
    } else {
        return c.json({ message: "Key not found" }, 404);
    }
}

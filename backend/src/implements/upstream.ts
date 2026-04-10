import type { Context } from "hono";
import { UpstreamRepository } from "../repositories/upstreamRepository";
import { logger } from "../utils/logger";
import { randomUUID } from "node:crypto";
import { UpstreamCredentialSchema } from "../schemas/upstream";

const repo = UpstreamRepository.getInstance();

/**
 * 獲取所有上游憑證列表
 */
export async function ListUpstreams(c: Context) {
    const upstreams = repo.findAll();
    return c.json({ data: upstreams });
}

/**
 * 建立新的上游憑證 (支援 OAuth2 JSON)
 */
export async function CreateUpstream(c: Context) {
    try {
        const body = await c.req.json();
        
        // 解析並驗證
        const id = randomUUID();
        const newUpstream = {
            id,
            type: body.type || 'oauth2',
            label: body.label || "New Upstream",
            config: typeof body.config === 'string' ? body.config : JSON.stringify(body.config),
            status: 'active' as const,
            weight: body.weight || 1,
            createdAt: Date.now()
        };

        const result = UpstreamCredentialSchema.safeParse(newUpstream);
        if (!result.success) {
            return c.json({ message: "Invalid upstream config", error: result.error }, 400);
        }

        repo.add(newUpstream);
        logger.info("New Upstream Credential added", { id, label: newUpstream.label });

        return c.json(newUpstream);
    } catch (e) {
        logger.error("Create Upstream failed", { error: String(e) });
        return c.json({ message: "Invalid request" }, 400);
    }
}

/**
 * 刪除上游憑證
 */
export async function DeleteUpstream(c: Context) {
    const id = c.req.param("id");
    const success = repo.delete(id);

    if (success) {
        logger.info("Upstream Credential deleted", { id });
        return c.json({ message: "Upstream deleted successfully" });
    } else {
        return c.json({ message: "Upstream not found" }, 404);
    }
}

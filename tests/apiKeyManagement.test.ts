import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Hono } from "hono";
import app from "../src/index";
import { sign } from "hono/jwt";
import { config } from "../src/config";
import { ApiKeyRepository } from "../src/repositories/apiKeyRepository";
import { existsSync, unlinkSync } from "fs";
import { join } from "path";

const DB_PATH = join(process.cwd(), "api_keys.db");

describe("API Key Management Integration", () => {
    let adminToken: string;
    const repo = ApiKeyRepository.getInstance();

    beforeEach(async () => {
        // Reset DB
        repo.clearAll();

        // Generate Admin Token
        const payload = {
            sub: "admin",
            role: "admin",
            iat: Math.floor(Date.now() / 1000),
        };
        adminToken = await sign(payload, config.jwtSecret, "HS256");
    });

    afterEach(() => {
        // We typically don't delete DB here to avoid locking/recreating
        // but for integration tests we could if we wanted a clean start.
        // However, repo.clearAll() in beforeEach is enough.
    });

    it("should list, create, and revoke keys via API", async () => {
        // 1. Create a key
        const createRes = await app.fetch(new Request("http://localhost/v1/admin/keys", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${adminToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ label: "Integration Test Key" })
        }));
        expect(createRes.status).toBe(200);
        const newKey = await createRes.json() as any;
        expect(newKey.label).toBe("Integration Test Key");
        expect(newKey.token).toStartWith("sk-");

        // 2. List keys
        const listRes = await app.fetch(new Request("http://localhost/v1/admin/keys", {
            headers: { "Authorization": `Bearer ${adminToken}` }
        }));
        expect(listRes.status).toBe(200);
        const { data } = await listRes.json() as any;
        expect(data).toHaveLength(1);
        expect(data[0].id).toBe(newKey.id);

        // 3. Test Authentication with the new API Key
        const authTestRes = await app.fetch(new Request("http://localhost/v1/models", {
            headers: { "Authorization": `Bearer ${newKey.token}` }
        }));
        expect(authTestRes.status === 200 || authTestRes.status === 401).toBe(true);
        expect(authTestRes.status).not.toBe(401);

        // 4. Revoke key
        const revokeRes = await app.fetch(new Request(`http://localhost/v1/admin/keys/${newKey.id}`, {
            method: "DELETE",
            headers: { "Authorization": `Bearer ${adminToken}` }
        }));
        expect(revokeRes.status).toBe(200);

        // 5. Verify revoked key fails auth
        const authFailRes = await app.fetch(new Request("http://localhost/v1/models", {
            headers: { "Authorization": `Bearer ${newKey.token}` }
        }));
        expect(authFailRes.status).toBe(401);
    });

    it("should reject unauthorized access to admin endpoints", async () => {
        const res = await app.fetch(new Request("http://localhost/v1/admin/keys"));
        expect(res.status).toBe(401);
    });
});

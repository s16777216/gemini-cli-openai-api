import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { ApiKeyRepository } from "../src/repositories/apiKeyRepository";
import { existsSync, unlinkSync } from "fs";
import { join } from "path";

const DB_PATH = join(process.cwd(), "api_keys.db");

describe("ApiKeyRepository (SQLite)", () => {
    let repo: ApiKeyRepository;

    beforeEach(() => {
        repo = ApiKeyRepository.getInstance();
        repo.clearAll();
    });

    afterEach(() => {
        // We keep the DB file for standard usage, but clear it between tests
    });

    it("should add and find a key", () => {
        const newKey = {
            id: "test-id",
            token: "sk-test-token",
            label: "Test Key",
            status: "active" as const,
            createdAt: Date.now()
        };

        const success = repo.add(newKey);
        expect(success).toBe(true);

        const foundById = repo.findById("test-id");
        expect(foundById).toEqual(newKey);

        const foundByToken = repo.findByToken("sk-test-token");
        expect(foundByToken).toEqual(newKey);
    });

    it("should return all keys in desc order", () => {
        const key1 = { id: "1", token: "tk1", label: "L1", status: "active" as const, createdAt: 1000 };
        const key2 = { id: "2", token: "tk2", label: "L2", status: "active" as const, createdAt: 2000 };

        repo.add(key1);
        repo.add(key2);

        const all = repo.findAll();
        expect(all).toHaveLength(2);
        // Order by createdAt DESC
        expect(all[0]!.id).toBe("2");
        expect(all[1]!.id).toBe("1");
    });

    it("should update key status", () => {
        const key = { id: "u1", token: "tu1", label: "LU1", status: "active" as const, createdAt: Date.now() };
        repo.add(key);

        const success = repo.updateStatus("u1", "revoked");
        expect(success).toBe(true);

        const updated = repo.findById("u1");
        expect(updated?.status).toBe("revoked");
    });

    it("should fail to add duplicate tokens", () => {
        const key1 = { id: "d1", token: "dtk", label: "D1", status: "active" as const, createdAt: Date.now() };
        const key2 = { id: "d2", token: "dtk", label: "D2", status: "active" as const, createdAt: Date.now() };

        repo.add(key1);
        const success = repo.add(key2);
        expect(success).toBe(false);
    });

    it("should persist data to SQLite file", () => {
        expect(existsSync(DB_PATH)).toBe(true);
    });
});

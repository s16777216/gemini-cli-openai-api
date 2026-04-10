import { Database } from "bun:sqlite";
import { dirname } from "path";
import * as fs from "fs";
import { config } from "../config";
import type { ApiKey } from "../schemas/apiKey";
import { logger } from "../utils/logger";

export class ApiKeyRepository {
    private static instance: ApiKeyRepository;
    private db: Database;

    private constructor() {
        const dir = dirname(config.databasePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        this.db = new Database(config.databasePath);
        this.init();
    }

    public static getInstance(): ApiKeyRepository {
        if (!ApiKeyRepository.instance) {
            ApiKeyRepository.instance = new ApiKeyRepository();
        }
        return ApiKeyRepository.instance;
    }

    private init() {
        this.db.run(`
            CREATE TABLE IF NOT EXISTS api_keys (
                id TEXT PRIMARY KEY,
                token TEXT UNIQUE,
                label TEXT,
                status TEXT,
                createdAt INTEGER
            )
        `);

        // 重新加入：Session 歷史紀錄表
        this.db.run(`
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                title TEXT,
                model TEXT,
                updatedAt INTEGER
            )
        `);

        // 訊息明細表
        this.db.run(`
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sessionId TEXT,
                role TEXT,
                content TEXT,
                createdAt INTEGER,
                FOREIGN KEY(sessionId) REFERENCES sessions(id) ON DELETE CASCADE
            )
        `);

        // 新增：上游憑證池表 (支援多帳號負載均衡)
        this.db.run(`
            CREATE TABLE IF NOT EXISTS upstream_credentials (
                id TEXT PRIMARY KEY,
                type TEXT,
                label TEXT,
                config TEXT,
                status TEXT,
                weight INTEGER DEFAULT 1,
                lastUsedAt INTEGER,
                createdAt INTEGER
            )
        `);
    }

    public findAll(): ApiKey[] {
        const query = this.db.query("SELECT * FROM api_keys ORDER BY createdAt DESC");
        return query.all() as ApiKey[];
    }

    public findById(id: string): ApiKey | undefined {
        const query = this.db.query("SELECT * FROM api_keys WHERE id = ?1");
        return query.get(id) as ApiKey | undefined;
    }

    public findByToken(token: string): ApiKey | undefined {
        const query = this.db.query("SELECT * FROM api_keys WHERE token = ?1");
        return query.get(token) as ApiKey | undefined;
    }

    public add(key: ApiKey): boolean {
        try {
            const query = this.db.query(`
                INSERT INTO api_keys (id, token, label, status, createdAt)
                VALUES (?1, ?2, ?3, ?4, ?5)
            `);
            query.run(key.id, key.token, key.label, key.status, key.createdAt);
            return true;
        } catch (e) {
            logger.error("Failed to add api key to SQLite", { error: String(e) });
            return false;
        }
    }

    public updateStatus(id: string, status: 'active' | 'revoked'): boolean {
        try {
            const query = this.db.query("UPDATE api_keys SET status = ?1 WHERE id = ?2");
            const result = query.run(status, id);
            return result.changes > 0;
        } catch (e) {
            logger.error("Failed to update api key status in SQLite", { error: String(e) });
            return false;
        }
    }

    // Helper for testing
    public clearAll() {
        this.db.run("DELETE FROM api_keys");
    }

    public close() {
        this.db.close();
    }
}

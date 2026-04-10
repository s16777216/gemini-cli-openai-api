import { Database } from "bun:sqlite";
import { config } from "../config";
import type { UpstreamCredential } from "../schemas/upstream";
import { logger } from "../utils/logger";

export class UpstreamRepository {
    private static instance: UpstreamRepository;
    private db: Database;

    private constructor() {
        this.db = new Database(config.databasePath);
    }

    public static getInstance(): UpstreamRepository {
        if (!UpstreamRepository.instance) {
            UpstreamRepository.instance = new UpstreamRepository();
        }
        return UpstreamRepository.instance;
    }

    public findAll(): UpstreamCredential[] {
        const query = this.db.query("SELECT * FROM upstream_credentials ORDER BY createdAt DESC");
        return query.all() as UpstreamCredential[];
    }

    public findActive(): UpstreamCredential[] {
        const query = this.db.query("SELECT * FROM upstream_credentials WHERE status = 'active' ORDER BY lastUsedAt ASC");
        return query.all() as UpstreamCredential[];
    }

    public add(cred: UpstreamCredential): boolean {
        try {
            const query = this.db.query(`
                INSERT INTO upstream_credentials (id, type, label, config, status, weight, lastUsedAt, createdAt)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            `);
            query.run(cred.id, cred.type, cred.label, cred.config, cred.status, cred.weight, cred.lastUsedAt ?? null, cred.createdAt);
            return true;
        } catch (e) {
            logger.error("Failed to add upstream credential to SQLite", { error: String(e) });
            return false;
        }
    }

    public updateStatus(id: string, status: string): boolean {
        try {
            const query = this.db.query("UPDATE upstream_credentials SET status = ?1 WHERE id = ?2");
            const result = query.run(status, id);
            return result.changes > 0;
        } catch (e) {
            logger.error("Failed to update upstream status in SQLite", { error: String(e) });
            return false;
        }
    }

    public updateLastUsed(id: string): void {
        try {
            const query = this.db.query("UPDATE upstream_credentials SET lastUsedAt = ?1 WHERE id = ?2");
            query.run(Date.now(), id);
        } catch (e) {
            logger.error("Failed to update lastUsedAt in SQLite", { error: String(e) });
        }
    }

    public delete(id: string): boolean {
        try {
            const query = this.db.query("DELETE FROM upstream_credentials WHERE id = ?1");
            const result = query.run(id);
            return result.changes > 0;
        } catch (e) {
            logger.error("Failed to delete upstream credential in SQLite", { error: String(e) });
            return false;
        }
    }
}

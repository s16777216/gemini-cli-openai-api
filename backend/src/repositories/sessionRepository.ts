import { Database } from "bun:sqlite";
import { config } from "../config";
import type { Session, DbMessage } from "../schemas/session";

export class SessionRepository {
    private db: Database;
    private static instance: SessionRepository;

    private constructor() {
        this.db = new Database(config.databasePath);
    }

    public static getInstance(): SessionRepository {
        if (!SessionRepository.instance) {
            SessionRepository.instance = new SessionRepository();
        }
        return SessionRepository.instance;
    }

    public getStats() {
        const sessionCount = this.db.query("SELECT COUNT(*) as count FROM sessions").get() as { count: number };
        const messageCount = this.db.query("SELECT COUNT(*) as count FROM messages").get() as { count: number };
        return {
            totalSessions: sessionCount.count,
            totalMessages: messageCount.count
        };
    }

    public findAll(limit: number = 20): Session[] {
        const query = this.db.query("SELECT * FROM sessions ORDER BY updatedAt DESC LIMIT ?");
        return query.all(limit) as Session[];
    }

    public findById(id: string): Session | null {
        const query = this.db.query("SELECT * FROM sessions WHERE id = ?");
        const session = query.get(id) as Session | null;
        if (!session) return null;

        const msgQuery = this.db.query("SELECT * FROM messages WHERE sessionId = ? ORDER BY createdAt ASC");
        session.messages = msgQuery.all(id) as DbMessage[];
        return session;
    }

    public upsert(session: Session): void {
        const query = this.db.query(`
            INSERT INTO sessions (id, title, model, updatedAt)
            VALUES ($id, $title, $model, $updatedAt)
            ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                model = excluded.model,
                updatedAt = excluded.updatedAt
        `);
        query.run({
            $id: session.id,
            $title: session.title,
            $model: session.model || null,
            $updatedAt: session.updatedAt
        });
    }

    public addMessage(message: DbMessage): void {
        const query = this.db.query(`
            INSERT INTO messages (sessionId, role, content, createdAt)
            VALUES ($sessionId, $role, $content, $createdAt)
        `);
        query.run({
            $sessionId: message.sessionId,
            $role: message.role,
            $content: message.content,
            $createdAt: message.createdAt
        });

        // 更新 Session 的 updatedAt
        this.db.run("UPDATE sessions SET updatedAt = ? WHERE id = ?", [Date.now(), message.sessionId]);
    }

    public delete(id: string): void {
        this.db.run("DELETE FROM sessions WHERE id = ?", [id]);
        // 由於外鍵 CASCADE，訊息會自動刪除
    }
    
    public deleteAll(): void {
        this.db.run("DELETE FROM sessions");
        // 由於外鍵 CASCADE，所有訊息也會被清空
    }
}

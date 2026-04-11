import { Database } from "bun:sqlite";
import { config } from "../config";
import { logger } from "../utils/logger";

export interface RequestLog {
    id?: number;
    upstreamId: string;
    model: string;
    statusCode: number;
    latency: number;
    error?: string | null;
    createdAt: number;
}

export class RequestLogRepository {
    private static instance: RequestLogRepository;
    private db: Database;

    private constructor() {
        this.db = new Database(config.databasePath);
    }

    public static getInstance(): RequestLogRepository {
        if (!RequestLogRepository.instance) {
            RequestLogRepository.instance = new RequestLogRepository();
        }
        return RequestLogRepository.instance;
    }

    /**
     * 新增一筆請求日誌
     */
    public add(log: RequestLog): void {
        try {
            const query = this.db.query(`
                INSERT INTO request_logs (upstreamId, model, statusCode, latency, error, createdAt)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            `);
            query.run(
                log.upstreamId,
                log.model,
                log.statusCode,
                log.latency,
                log.error ?? null,
                log.createdAt || Date.now()
            );
        } catch (e) {
            logger.error("Failed to add request log to SQLite", { error: String(e) });
        }
    }

    /**
     * 獲取統計摘要 (最近 24 小時)
     */
    public getRecentStats() {
        const last24h = Date.now() - (24 * 60 * 60 * 1000);
        
        const summary = this.db.query(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN statusCode >= 200 AND statusCode < 300 THEN 1 ELSE 0 END) as success,
                SUM(CASE WHEN statusCode = 429 THEN 1 ELSE 0 END) as rateLimited,
                SUM(CASE WHEN statusCode >= 400 AND statusCode != 429 THEN 1 ELSE 0 END) as error
            FROM request_logs
            WHERE createdAt > ?1
        `).get(last24h) as { total: number, success: number, rateLimited: number, error: number };

        return {
            total: summary.total || 0,
            success: summary.success || 0,
            rateLimited: summary.rateLimited || 0,
            error: summary.error || 0,
            successRate: summary.total > 0 ? (summary.success / summary.total * 100).toFixed(1) : "0"
        };
    }

    /**
     * 獲取各狀態碼分佈
     */
    public getStatusDistribution() {
        const last24h = Date.now() - (24 * 60 * 60 * 1000);
        const query = this.db.query(`
            SELECT statusCode, COUNT(*) as count
            FROM request_logs
            WHERE createdAt > ?1
            GROUP BY statusCode
            ORDER BY count DESC
        `);
        return query.all(last24h) as { statusCode: number, count: number }[];
    }
}

import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { sign } from "hono/jwt";
import { config } from "../config";
import { logger } from "../utils/logger";

/**
 * 管理員登入：驗證帳密並核發長效 JWT
 */
export async function Login(c: Context) {
    const { username, password } = await c.req.json();

    if (username !== config.rootUser || password !== config.rootPassword) {
        logger.warn("Login failed: Invalid credentials", { username });
        throw new HTTPException(401, { message: "Invalid username or password" });
    }

    const payload = {
        sub: username,
        role: "admin",
        iat: Math.floor(Date.now() / 1000),
    };

    const token = await sign(payload, config.jwtSecret, "HS256");

    logger.info("Admin logged in successfully", { username });

    return c.json({
        token,
        message: "Login successful"
    });
}

/**
 * 原有的暫時保留或移除，由於現在改用 Login 模式
 */
export async function GenerateToken(c: Context) {
    // 這裡可以導向 Login 或保留作為 Legacy APIkey 產生工具
    throw new HTTPException(405, { message: "Method Not Allowed - Please use /login" });
}

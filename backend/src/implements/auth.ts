import type { Context } from "hono";
import { AuthService } from "../services/authService";
import { UpstreamRepository } from "../repositories/upstreamRepository";
import { logger } from "../utils/logger";
import crypto from "node:crypto";

const SUCCESS_HTML = (email: string) => `
<!DOCTYPE html>
<html>
<head>
    <title>Gemini Proxy - 授權成功</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f9fafb; color: #111827; }
        .card { background: #fff; border-radius: 12px; padding: 40px; text-align: center; box-shadow: 0 4px 20px rgba(0,0,0,0.08); max-width: 400px; border: 1px solid #e5e7eb; }
        h1 { color: #10b981; margin: 0 0 16px; font-size: 24px; }
        p { color: #4b5563; margin: 0 0 24px; line-height: 1.5; }
        .email { font-weight: 600; color: #1f2937; }
        .btn { background: #3b82f6; color: #fff; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: 500; text-decoration: none; }
    </style>
</head>
<body>
    <div class="card">
        <h1>授權成功！</h1>
        <p>已成功將 Google 帳號 <span class="email">${email}</span> 加入憑證池。</p>
        <p>您可以關閉此視窗，並返回管理介面重新整理列表。</p>
        <button class="btn" onclick="window.close()">關閉視窗</button>
    </div>
</body>
</html>
`;

const ERROR_HTML = (msg: string) => `
<!DOCTYPE html>
<html>
<head>
    <title>Gemini Proxy - 授權失敗</title>
    <style>
        body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #fff5f5; }
        .card { background: #fff; border-radius: 12px; padding: 40px; text-align: center; box-shadow: 0 4px 20px rgba(0,0,0,0.1); border: 1px solid #feb2b2; }
        h1 { color: #e53e3e; }
    </style>
</head>
<body>
    <div class="card">
        <h1>授權失敗</h1>
        <p>${msg}</p>
        <button onclick="window.close()">關閉</button>
    </div>
</body>
</html>
`;

export async function OAuthLogin(c: Context) {
    // 取得當前請求的 Host 以便動態建構 redirect_uri
    const url = new URL(c.req.url);
    const redirectUri = `${url.protocol}//${url.host}/v1/admin/auth/callback`;
    
    logger.info("Starting OAuth login flow", { redirectUri });
    const { url: authUrl } = await AuthService.buildAuthorizationUrl(redirectUri);
    return c.redirect(authUrl);
}

export async function OAuthCallback(c: Context) {
    const code = c.req.query("code");
    const state = c.req.query("state");
    const error = c.req.query("error");

    if (error) {
        return c.html(ERROR_HTML(`Google 回傳錯誤: ${error}`), 400);
    }
    if (!code || !state) {
        return c.html(ERROR_HTML("遺失 code 或 state 參數"), 400);
    }

    const url = new URL(c.req.url);
    const redirectUri = `${url.protocol}//${url.host}/v1/admin/auth/callback`;

    const result = await AuthService.exchangeCode(code, state, redirectUri);
    if (!result.ok || !result.refreshToken) {
        return c.html(ERROR_HTML(result.error || "交換 Token 失敗"), 500);
    }

    // 儲存至資料庫
    const repo = UpstreamRepository.getInstance();
    const email = result.email || "Unknown Google Account";
    
    const configObj = {
        client_id: "681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com",
        client_secret: "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",
        refresh_token: result.refreshToken,
        access_token: result.accessToken,
        expiry_date: result.expiresAt
    };

    repo.add({
        id: crypto.randomUUID(),
        type: 'oauth2',
        label: `Google: ${email}`,
        config: JSON.stringify(configObj),
        status: 'active',
        weight: 1,
        createdAt: Date.now()
    });

    logger.info("Successfully added new Google OAuth2 account", { email });
    return c.html(SUCCESS_HTML(email));
}

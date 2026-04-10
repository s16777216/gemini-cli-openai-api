import type { OAuth2Config } from "../schemas/upstream";
import { logger } from "./logger";

const OAUTH_REFRESH_URL = "https://oauth2.googleapis.com/token";

export interface TokenResponse {
    access_token: string;
    expires_in: number;
    token_type: string;
}

/**
 * GoogleAuthManager handles token refreshing for a single OAuth2 configuration.
 */
export class GoogleAuthManager {
    /**
     * Refresh the OAuth2 access token using a refresh token.
     */
    public static async refreshAccessToken(config: OAuth2Config): Promise<TokenResponse> {
        logger.info("Refreshing Google OAuth2 access token...");

        const response = await fetch(OAUTH_REFRESH_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: new URLSearchParams({
                client_id: config.client_id,
                client_secret: config.client_secret,
                refresh_token: config.refresh_token,
                grant_type: "refresh_token"
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            logger.error("Failed to refresh Google token", { status: response.status, error: errorText });
            throw new Error(`Token refresh failed: ${errorText}`);
        }

        const data = (await response.json()) as TokenResponse;
        logger.info("Token refreshed successfully", { expiresIn: data.expires_in });
        return data;
    }

    /**
     * Utility to check if a token is expired.
     * @param expiryDate Timestamp in milliseconds
     * @param bufferSeconds Buffer time before actual expiry
     */
    public static isExpired(expiryDate: number | undefined, bufferSeconds: number = 300): boolean {
        if (!expiryDate) return true;
        return Date.now() + bufferSeconds * 1000 > expiryDate;
    }
}

import { config } from "../config";
import { logger } from "../utils/logger";

interface PkceParams {
    verifier: string;
    challenge: string;
}

interface TokenExchangeResult {
    ok: boolean;
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    email?: string;
    error?: string;
}

export class AuthService {
    private static pendingVerifiers = new Map<string, string>();

    /**
     * Build the Google Authorization URL and generate a state/verifier.
     */
    public static async buildAuthorizationUrl(redirectUri: string): Promise<{ url: string; state: string }> {
        const { challenge, verifier } = await this.generatePkce();
        const state = this.generateState();

        this.pendingVerifiers.set(state, verifier);

        const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        url.searchParams.set("client_id", config.googleClientId);
        url.searchParams.set("response_type", "code");
        url.searchParams.set("redirect_uri", redirectUri);
        url.searchParams.set("scope", config.googleScopes.join(" "));
        url.searchParams.set("code_challenge", challenge);
        url.searchParams.set("code_challenge_method", "S256");
        url.searchParams.set("state", state);
        url.searchParams.set("access_type", "offline");
        url.searchParams.set("prompt", "consent");

        return { url: url.toString(), state };
    }

    /**
     * Exchange the authorization code for tokens.
     */
    public static async exchangeCode(code: string, state: string, redirectUri: string): Promise<TokenExchangeResult> {
        const verifier = this.pendingVerifiers.get(state);
        if (!verifier) {
            return { ok: false, error: "Unknown or expired OAuth state parameter" };
        }
        this.pendingVerifiers.delete(state);

        try {
            const response = await fetch("https://oauth2.googleapis.com/token", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    client_id: config.googleClientId,
                    client_secret: config.googleClientSecret,
                    code,
                    grant_type: "authorization_code",
                    redirect_uri: redirectUri,
                    code_verifier: verifier,
                }),
            });

            if (!response.ok) {
                const text = await response.text();
                return { ok: false, error: `Token exchange failed (${response.status}): ${text}` };
            }

            const payload = (await response.json()) as {
                access_token: string;
                refresh_token?: string;
                expires_in: number;
            };

            if (!payload.refresh_token) {
                return { ok: false, error: "No refresh token in response - try removing previously granted access at https://myaccount.google.com/permissions" };
            }

            // Fetch user email for labeling
            const email = await this.fetchUserEmail(payload.access_token);

            return {
                ok: true,
                accessToken: payload.access_token,
                refreshToken: payload.refresh_token,
                expiresAt: Date.now() + payload.expires_in * 1000,
                email,
            };
        } catch (error) {
            return { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
    }

    private static async fetchUserEmail(accessToken: string): Promise<string | undefined> {
        try {
            const response = await fetch("https://www.googleapis.com/oauth2/v1/userinfo?alt=json", {
                headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (!response.ok) return undefined;
            const info = (await response.json()) as { email?: string };
            return info.email;
        } catch {
            return undefined;
        }
    }

    private static async generatePkce(): Promise<PkceParams> {
        const verifierBytes = new Uint8Array(32);
        crypto.getRandomValues(verifierBytes);
        const verifier = this.base64url(verifierBytes);

        const challengeBytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
        const challenge = this.base64url(new Uint8Array(challengeBytes));

        return { verifier, challenge };
    }

    private static generateState(): string {
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        return Array.from(bytes)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
    }

    private static base64url(bytes: Uint8Array): string {
        const base64 = btoa(String.fromCharCode(...bytes));
        return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
    }
}

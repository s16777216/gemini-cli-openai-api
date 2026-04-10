import type { OAuth2Config } from "../../schemas/upstream";
import { GoogleAuthManager } from "../../utils/googleAuth";
import { logger } from "../../utils/logger";

const CODE_ASSIST_ENDPOINT = "https://cloudaicompanion.googleapis.com";
const CODE_ASSIST_API_VERSION = "v1beta";

export interface GeminiResponsePart {
  text?: string;
  thought?: boolean;
  functionCall?: {
    name: string;
    args: object;
  };
}

export interface GeminiResponseChunk {
  response?: {
    candidates?: Array<{
      content?: {
        parts?: GeminiResponsePart[];
      };
      finishReason?: string;
    }>;
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
    };
  };
}

export class GeminiApiProvider {
    private config: OAuth2Config;
    private accessToken: string | null = null;
    private expiryDate: number | null = null;

    constructor(config: OAuth2Config) {
        this.config = config;
        this.accessToken = config.access_token || null;
        this.expiryDate = config.expiry_date || null;
    }

    private async ensureAuth(): Promise<string> {
        if (!this.accessToken || GoogleAuthManager.isExpired(this.expiryDate ?? 0)) {
            const tokenData = await GoogleAuthManager.refreshAccessToken(this.config);
            this.accessToken = tokenData.access_token;
            this.expiryDate = Date.now() + tokenData.expires_in * 1000;
            // Note: In a real implementation, we should update the DB with these new tokens
        }
        return this.accessToken;
    }

    /**
     * Executes a chat completion request via the Google Code Assist API.
     */
    public async streamGenerateContent(modelId: string, contents: any[], generationConfig: any = {}): Promise<ReadableStream> {
        const token = await this.ensureAuth();
        const projectId = this.config.project_id || "unused-project-id";

        const url = `${CODE_ASSIST_ENDPOINT}/${CODE_ASSIST_API_VERSION}:streamGenerateContent?alt=sse`;
        
        const payload = {
            model: modelId,
            project: projectId,
            request: {
                contents,
                generationConfig: {
                    temperature: generationConfig.temperature,
                    topP: generationConfig.top_p,
                    maxOutputTokens: generationConfig.max_tokens,
                    stopSequences: generationConfig.stop,
                    ...generationConfig
                }
            }
        };

        logger.info("Sending request to Gemini API", { modelId, projectId });

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            logger.error("Gemini API request failed", { status: response.status, error: errorText });
            throw new Error(`Gemini API error (${response.status}): ${errorText}`);
        }

        if (!response.body) {
            throw new Error("Gemini API response has no body");
        }

        return response.body;
    }
}

import type { OAuth2Config } from "../../schemas/upstream";
import { GoogleAuthManager } from "../../utils/googleAuth";
import { logger } from "../../utils/logger";

const CODE_ASSIST_ENDPOINT = "https://cloudcode-pa.googleapis.com";
const CODE_ASSIST_API_VERSION = "v1internal";

const DEFAULT_SAFETY_SETTINGS = [
    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_CIVIC_INTEGRITY", threshold: "BLOCK_NONE" }
];

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
    private config?: OAuth2Config;
    private apiKey?: string;
    private label: string;
    private authType: 'oauth2' | 'api_key';
    private accessToken: string | null = null;
    private expiryDate: number | null = null;

    constructor(credential: string | OAuth2Config, type: 'oauth2' | 'api_key' = 'oauth2', label: string = 'Unknown') {
        this.authType = type;
        this.label = label;
        if (type === 'oauth2') {
            this.config = credential as OAuth2Config;
            this.accessToken = this.config.access_token || null;
            this.expiryDate = this.config.expiry_date || null;
        } else {
            this.apiKey = credential as string;
        }
    }

    private async ensureAuth(): Promise<string> {
        if (!this.config) throw new Error("OAuth2 Config is missing");
        if (!this.accessToken || GoogleAuthManager.isExpired(this.expiryDate ?? 0)) {
            const tokenData = await GoogleAuthManager.refreshAccessToken(this.config);
            this.accessToken = tokenData.access_token;
            this.expiryDate = Date.now() + tokenData.expires_in * 1000;
        }
        return this.accessToken;
    }

    /**
     * Discovers the Google Cloud project ID automatically if not provided.
     */
    private async discoverProjectId(token: string): Promise<string> {
        if (!this.config) return "unused-project-id";
        
        if (this.config.project_id && this.config.project_id !== "unused-project-id") {
            return this.config.project_id;
        }

        logger.info("Discovering Project ID for Gemini...");
        const url = `${CODE_ASSIST_ENDPOINT}/${CODE_ASSIST_API_VERSION}:loadCodeAssist`;
        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    metadata: { ideType: "ANTIGRAVITY" }
                })
            });

            if (response.ok) {
                const data = await response.json() as any;
                const discoveredId = data.cloudaicompanionProject;
                if (discoveredId) {
                    logger.info("Directly discovered Gemini Project ID", { discoveredId });
                    this.config.project_id = discoveredId; // Cache it in memory for this session
                    return discoveredId;
                }
            }
            logger.warn("Project discovery returned no ID or failed", { status: response.status });
        } catch (e) {
            logger.error("Error during project discovery", { error: (e as any).message });
        }

        return "unused-project-id"; // Fallback
    }

    public async streamGenerateContent(modelId: string, contents: any[], generationConfig: any = {}): Promise<{ stream: ReadableStream; status: number }> {
        if (this.authType === 'api_key') {
            return this.streamGenerateContentWithApiKey(modelId, contents, generationConfig);
        } else {
            return this.streamGenerateContentWithOAuth2(modelId, contents, generationConfig);
        }
    }

    private async streamGenerateContentWithApiKey(modelId: string, contents: any[], generationConfig: any = {}): Promise<{ stream: ReadableStream; status: number }> {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:streamGenerateContent?alt=sse&key=${this.apiKey}`;
        
        const payload = {
            contents,
            generationConfig: {
                temperature: generationConfig.temperature,
                topP: generationConfig.topP || generationConfig.top_p,
                maxOutputTokens: generationConfig.maxOutputTokens || generationConfig.max_tokens,
                stopSequences: generationConfig.stopSequences || generationConfig.stop
            },
            safetySettings: DEFAULT_SAFETY_SETTINGS
        };

        logger.info("Sending request to Gemini API (API Key Channel)", { label: this.label, modelId });

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            logger.error("Gemini API Key request failed", { status: response.status, error: errorText });
            const error: any = new Error(errorText);
            error.status = response.status;
            throw error;
        }

        if (!response.body) throw new Error("Gemini API response has no body");
        return { stream: response.body, status: response.status };
    }

    private async streamGenerateContentWithOAuth2(modelId: string, contents: any[], generationConfig: any = {}): Promise<{ stream: ReadableStream; status: number }> {
        const token = await this.ensureAuth();
        const projectId = await this.discoverProjectId(token);

        const url = `${CODE_ASSIST_ENDPOINT}/${CODE_ASSIST_API_VERSION}:streamGenerateContent?alt=sse`;
        
        const payload = {
            model: modelId,
            project: projectId,
            request: {
                contents,
                generationConfig: {
                    temperature: generationConfig.temperature,
                    topP: generationConfig.topP || generationConfig.top_p,
                    maxOutputTokens: generationConfig.maxOutputTokens || generationConfig.max_tokens,
                    stopSequences: generationConfig.stopSequences || generationConfig.stop
                },
                safetySettings: DEFAULT_SAFETY_SETTINGS
            }
        };

        logger.info("Sending request to Gemini API (IDE Channel)", { label: this.label, modelId, projectId });

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            logger.error("Gemini API request failed", { status: response.status, error: errorText });
            const error: any = new Error(errorText);
            error.status = response.status;
            throw error;
        }

        if (!response.body) {
            throw new Error("Gemini API response has no body");
        }

        return { stream: response.body, status: response.status };
    }
}

import type { Message } from "../schemas/chat";

export interface GeminiPart {
    text?: string;
    inlineData?: {
        mimeType: string;
        data: string;
    };
}

export interface GeminiContent {
    role: "user" | "model";
    parts: GeminiPart[];
}

/**
 * Converts OpenAI messages to Gemini Native Content format.
 */
export function toGeminiContents(messages: Message[]): GeminiContent[] {
    const contents: GeminiContent[] = [];

    for (const msg of messages) {
        const role = msg.role === "assistant" ? "model" : "user";
        const parts: GeminiPart[] = [];

        if (typeof msg.content === "string") {
            parts.push({ text: msg.content });
        } else if (Array.isArray(msg.content)) {
            for (const part of msg.content) {
                if (part.type === "text") {
                    parts.push({ text: part.text });
                } else if (part.type === "image_url") {
                    // Handle image_url if needed in native mode
                    const url = part.image_url.url;
                    if (url.startsWith("data:")) {
                        const [mime, data] = url.split(",");
                        const mediaType = mime.split(":")[1].split(";")[0];
                        parts.push({
                            inlineData: {
                                mimeType: mediaType,
                                data: data
                            }
                        });
                    }
                }
            }
        }

        if (parts.length > 0) {
            contents.push({ role, parts });
        }
    }

    return contents;
}

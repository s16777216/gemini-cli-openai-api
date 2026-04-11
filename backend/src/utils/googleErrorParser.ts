import { logger } from "./logger";

export interface GoogleError {
    error: {
        code: number;
        message: string;
        status: string;
        details?: any[];
    }
}

export interface ErrorParseResult {
    isRateLimit: boolean;
    retryAfterSeconds: number;
    originalMessage: string;
}

/**
 * Parses Google API error responses to extract rate limit information.
 */
export function parseGoogleError(errorText: string): ErrorParseResult {
    let isRateLimit = false;
    let retryAfterSeconds = 60; // Default fallback
    let message = errorText;

    try {
        const errorObj = JSON.parse(errorText) as GoogleError;
        if (errorObj.error) {
            message = errorObj.error.message;
            if (errorObj.error.code === 429 || errorObj.error.status === "RESOURCE_EXHAUSTED") {
                isRateLimit = true;
                
                // Try to extract "reset after Xs" from message
                const match = message.match(/reset after (\d+)s/);
                if (match && match[1]) {
                    retryAfterSeconds = parseInt(match[1], 10) + 1; // Add 1s safety buffer
                    logger.info(`Detected Google rate limit cooling period: ${retryAfterSeconds}s`);
                }
            }
        }
    } catch (e) {
        // Not JSON, fallback to simple string check
        if (errorText.includes("429") || errorText.includes("RESOURCE_EXHAUSTED")) {
            isRateLimit = true;
        }
    }

    return { isRateLimit, retryAfterSeconds, originalMessage: message };
}

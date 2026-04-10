import { toSSEChunk } from "./sseFormatter";
import { logger } from "./logger";

/**
 * Parses Gemini API SSE stream and converts it to OpenAI format.
 */
export async function handleApiStream(
    responseStream: ReadableStream,
    stream: { write: (data: string) => any },
    modelName: string,
    startTime: number
): Promise<string> {
    const reader = responseStream.pipeThrough(new TextDecoderStream()).getReader();
    let accumulatedContent = '';
    let firstByte = true;

    // Buffer for potentially incomplete SSE lines
    let buffer = "";

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += value;
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith("data: ")) continue;

                if (firstByte) {
                    const ttfb = (performance.now() - startTime).toFixed(2);
                    console.log(`[Perf] TTFB (API Stream): ${ttfb}ms`);
                    firstByte = false;
                }

                const data = trimmed.substring(6);
                if (data === "[DONE]") continue;

                try {
                    const json = JSON.parse(data);
                    const parts = json.response?.candidates?.[0]?.content?.parts;
                    
                    if (parts) {
                        for (const part of parts) {
                            if (part.text) {
                                accumulatedContent += part.text;
                                await stream.write(toSSEChunk(part.text, modelName));
                            }
                            // TODO: Handle function calls in native mode later
                        }
                    }
                } catch (e) {
                    logger.warn("Failed to parse Gemini API chunk", { data });
                }
            }
        }
    } catch (err) {
        logger.error("API Stream error", { error: String(err) });
        throw err;
    }

    // Send closing chunks
    await stream.write(toSSEChunk("", modelName, "stop"));
    await stream.write("data: [DONE]\n\n");

    return accumulatedContent;
}

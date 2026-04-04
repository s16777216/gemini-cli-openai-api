import { toSSEChunk, sendToolCallSSE } from "./sseFormatter";
import { logger } from "./logger";

export function splitLines(text: string): string[] {
    return text.split('\n').map(line => line.trim()).filter(line => line !== '');
}

export function pipeStderr(stderr: AsyncIterable<Uint8Array> | null) {
    if (!stderr) return;
    (async () => {
        const decoder = new TextDecoder();
        for await (const chunk of stderr) {
            const text = decoder.decode(chunk);
            if (text.includes("Loaded cached credentials.")) continue;
            logger.warn('Gemini CLI stderr', { text: text.trim() });
        }
    })();
}

export async function handleStream(
    stdout: AsyncIterable<Uint8Array>,
    stream: { write: (data: string) => any },
    modelName: string,
    startTime: number,
    hasTools: boolean
): Promise<string> {
    const decoder = new TextDecoder();
    let accumulatedContent = '';
    let buffer = '';
    let firstByte = true;

    let state: 'TEXT' | 'TOOL' = 'TEXT';
    let streamedLength = 0;
    const startTag = '<tool_calls>';
    const endTag = '</tool_calls>';

    for await (const chunk of stdout) {
        if (firstByte) {
            const ttfb = (performance.now() - startTime).toFixed(2);
            console.log(`[Perf] TTFB (Stream): ${ttfb}ms`);
            firstByte = false;
        }
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
                const event = JSON.parse(trimmed);
                if (event.type === 'message' && event.role === 'assistant' && event.content) {
                    accumulatedContent += event.content;

                    if (state === 'TEXT') {
                        if (!hasTools) {
                            // 若無工具，直接無腦串流
                            const newText = accumulatedContent.slice(streamedLength);
                            await stream.write(toSSEChunk(newText, modelName));
                            streamedLength = accumulatedContent.length;
                        } else {
                            // 滑動視窗解析，避免太早吐出可能的 XML 標籤
                            const textToAnalyze = accumulatedContent.slice(streamedLength);
                            let safeLength = textToAnalyze.length;

                            for (let i = 1; i <= startTag.length; i++) {
                                if (textToAnalyze.endsWith(startTag.slice(0, i))) {
                                    safeLength = textToAnalyze.length - i;
                                    break;
                                }
                            }

                            const toolIndex = textToAnalyze.indexOf(startTag);
                            if (toolIndex !== -1) {
                                const safeText = textToAnalyze.slice(0, toolIndex);
                                if (safeText) {
                                    await stream.write(toSSEChunk(safeText, modelName));
                                }
                                state = 'TOOL';
                            } else {
                                if (safeLength > 0) {
                                    const safeText = textToAnalyze.slice(0, safeLength);
                                    await stream.write(toSSEChunk(safeText, modelName));
                                    streamedLength += safeText.length;
                                }
                            }
                        }
                    }
                } else if (event.type === 'result') {
                    if (state === 'TOOL') {
                        const startIndex = accumulatedContent.indexOf(startTag);
                        const endIndex = accumulatedContent.lastIndexOf(endTag);
                        
                        let jsonStr = '';
                        if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
                            jsonStr = accumulatedContent.substring(startIndex + startTag.length, endIndex).trim();
                        } else if (startIndex !== -1) {
                            jsonStr = accumulatedContent.substring(startIndex + startTag.length).trim();
                        }
                        
                        await sendToolCallSSE(stream, jsonStr, modelName);
                    } else {
                        // 清空任何殘留並關閉連線
                        if (streamedLength < accumulatedContent.length && state === 'TEXT') {
                            const remain = accumulatedContent.slice(streamedLength);
                            await stream.write(toSSEChunk(remain, modelName));
                        }
                        await stream.write(toSSEChunk("", modelName, "stop"));
                        await stream.write("data: [DONE]\n\n");
                    }
                }
            } catch {
                logger.warn('Stream: failed to parse JSON', { line: trimmed.slice(0, 100) });
            }
        }
    }
    const totalDuration = (performance.now() - startTime).toFixed(2);
    console.log(`[Perf] Stream finished. Total duration: ${totalDuration}ms`);
    return accumulatedContent.trim();
}

export async function collectStreamedContent(
    stdout: AsyncIterable<Uint8Array>,
    startTime: number
): Promise<string> {
    const decoder = new TextDecoder();
    let accumulated = '';
    let buffer = '';
    let firstByte = true;

    for await (const chunk of stdout) {
        if (firstByte) {
            const ttfb = (performance.now() - startTime).toFixed(2);
            console.log(`[Perf] TTFB (Collect): ${ttfb}ms`);
            firstByte = false;
        }
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
                const event = JSON.parse(trimmed);
                if (event.type === 'message' && event.role === 'assistant' && event.content) {
                    accumulated += event.content;
                }
            } catch {
                logger.warn('NonStream: failed to parse JSON', { line: trimmed });
            }
        }
    }

    const totalDuration = (performance.now() - startTime).toFixed(2);
    console.log(`[Perf] Content collection finished. Total duration: ${totalDuration}ms`);
    return accumulated.trim();
}

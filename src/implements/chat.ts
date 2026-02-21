import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { stream } from "hono/streaming";
import { ChatCompletionSchema, type Message } from "../schemas/chat";
import { GeminiArgument } from "../services/gemini";
import { flattenMessages, buildPromptWithTools } from "../utils/promptBuilder";
import { handleToolStream, handleTextStream, pipeStderr } from "../utils/chatStream";
import { config } from "../config";

export default async function ChatCompletions(context: Context) {
    const body = await context.req.json();
    const result = ChatCompletionSchema.safeParse(body);

    if (!result.success) {
        console.warn(`[Request] Invalid request body: ${JSON.stringify(body)}`);
        throw new HTTPException(400, {
            message: "Invalid request body",
            cause: result.error
        });
    }

    const { messages, stream: isStream, model, tools } = result.data as any;
    const hasTools = Array.isArray(tools) && tools.length > 0;
    const modelName = model ?? config.defaultModel;

    const flatText = flattenMessages(messages as Message[]);
    const prompt = hasTools ? buildPromptWithTools(flatText, tools) : flatText;

    console.log(`[Request] Stream: ${isStream}, Prompt: ${prompt.length} chars, Tools: ${hasTools ? tools.length : 0}`);

    const geminiArg = new GeminiArgument(prompt, modelName);
    const command = await geminiArg.toCommand();
    const proc = Bun.spawn(["pwsh", "-Command", command.join(" ")], {
        stdout: "pipe",
        stderr: "pipe",
    });

    context.header("Content-Type", "text/event-stream; charset=utf-8");
    context.header("Cache-Control", "no-cache");
    context.header("Connection", "keep-alive");
    context.header("X-Accel-Buffering", "no");

    return stream(context, async (s) => {
        pipeStderr(proc.stderr);

        if (proc.stdout) {
            if (hasTools) {
                await handleToolStream(proc.stdout, s, modelName);
            } else {
                await handleTextStream(proc.stdout, s, modelName);
            }
        }

        await proc.exited;
        // const exitCode = await proc.exited;
        // console.log(`[Process] Gemini CLI exited with code: ${exitCode}`);
        await geminiArg.cleanTempFile();
    });
}

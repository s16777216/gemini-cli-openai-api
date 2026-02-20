import z from "zod";

export const MessageSchema = z.object({
    role: z.string(),
    content: z.union([z.string(), z.array(z.any()), z.null(), z.undefined()]),
    tool_calls: z.array(z.any()).optional(),
    tool_call_id: z.string().optional(),
    name: z.string().optional(),
}).loose();

export const ChatCompletionSchema = z.object({
    model: z.string().optional(),
    messages: z.array(MessageSchema),
    stream: z.boolean().optional(),
    tools: z.array(z.any()).optional(),
    tool_choice: z.any().optional(),
}).loose();

export class GeminiArgument {
    readonly TMP_FOLDER = Bun.env.TEMP_FOLDER || "./temp"

    prompt: string;
    model: string;
    tempFilePath: string | null;

    constructor(prompt: string, model = "gemini") {
        this.prompt = prompt;
        this.model = model;
        this.tempFilePath = null;
    }

    async toCommand() {
        const tempFilePath = await this.writeTempFile(this.prompt)
        return ["cat", `"${tempFilePath}"`, "|", "gemini", "--model", this.model, "--output-format", "stream-json"]
    }

    private async writeTempFile(prompt: string) {
        const tempFilePath = `${this.TMP_FOLDER}/${new Date().getTime()}`
        await Bun.write(tempFilePath, prompt)
        this.tempFilePath = tempFilePath
        return tempFilePath
    }

    async cleanTempFile() {
        if (this.tempFilePath) {
            await Bun.file(this.tempFilePath).delete()
            this.tempFilePath = null
        }
    }
}

export interface Message {
    role: string;
    content: string | any[] | null | undefined;
    tool_calls?: any[];
    tool_call_id?: string;
    name?: string;
}

export function flattenMessages(messages: Message[]): string {
    return messages.map(m => {
        const role = m.role.charAt(0).toUpperCase() + m.role.slice(1);

        // tool 結果訊息（opencode 執行工具後回傳的結果）
        if (m.role === 'tool') {
            const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
            return `Tool Result: ${content}`;
        }

        // assistant 訊息中含有 tool_calls（AI 呼叫工具的紀錄）
        if (m.role === 'assistant' && m.tool_calls?.length) {
            const callsStr = m.tool_calls.map(tc => {
                const name = tc.function?.name ?? 'unknown';
                const args = tc.function?.arguments ?? '{}';
                return `Called: ${name}(${args})`;
            }).join('\n');
            const textContent = typeof m.content === 'string' && m.content ? m.content + '\n' : '';
            return `${role}: ${textContent}${callsStr}`;
        }

        let contentStr = '';
        if (typeof m.content === 'string') {
            contentStr = m.content;
        } else if (Array.isArray(m.content)) {
            contentStr = m.content
                .filter(part => part && part.type === 'text' && typeof part.text === 'string')
                .map(part => part.text)
                .join('\n');
        } else if (m.content === null || m.content === undefined) {
            contentStr = '';
        } else {
            contentStr = String(m.content);
        }

        return `${role}: ${contentStr}`;
    }).join('\n\n');
}

/** 將 OpenAI tools 定義注入系統提示，指示 gemini 使用 TOOL_CALL: 格式 */
export function buildPromptWithTools(flatMessages: string, tools: any[]): string {
    if (!tools || tools.length === 0) return flatMessages;

    // 只列出工具名稱與簡短說明，避免傳入 JSON schema 觸發 gemini CLI 的內建工具執行
    const toolDescriptions = tools.map(t => {
        const f = t.function;
        const firstLine = (f.description || '').split('\n')[0].substring(0, 120);
        // 列出必要參數
        const required: string[] = f.parameters?.required ?? [];
        const props = f.parameters?.properties ?? {};
        const paramDesc = required.map((k: string) => {
            const p = props[k];
            return `${k}: ${p?.type ?? 'string'}`;
        }).join(', ');
        return `  ${f.name}(${paramDesc}) — ${firstLine}`;
    }).join('\n');

    const toolInstruction = `=== OUTPUT FORMAT INSTRUCTIONS ===
IMPORTANT: Do NOT use any built-in tool calling, function calling, or code execution systems.
Do NOT attempt to execute any file operations or shell commands through any internal mechanism.

You have been given a task. If completing it requires performing an action (such as creating a file,
running a command, or searching for files), you MUST communicate that action by including a TOOL_CALL
line as plain text in your response.

Format for requesting an action (output this as plain text, do not call any functions):
TOOL_CALL:{"name":"<action_name>","arguments":<json_object_with_parameters>}

Available actions:
${toolDescriptions}

Rules:
- When you want to perform an action: output ONLY that TOOL_CALL line, nothing else.
- When you want to write a file: TOOL_CALL:{"name":"write","arguments":{"filePath":"/absolute/path","content":"full file content"}}
- When you want to run a shell command: TOOL_CALL:{"name":"bash","arguments":{"command":"the command","description":"what it does"}}
- When you want to read a file: TOOL_CALL:{"name":"read","arguments":{"filePath":"/absolute/path"}}
- After a tool result is given back to you, continue with the next action or final response.
- If no action is needed, just respond with your answer as normal text.
=== END FORMAT INSTRUCTIONS ===

`;

    return toolInstruction + flatMessages;
}

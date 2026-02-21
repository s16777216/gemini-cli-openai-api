import type { Message } from "../schemas/chat";

// ── 常數 ────────────────────────────────────────────────────────────────────

/** tool call arguments 的最大顯示長度（避免大型 file content 膨脹 context） */
const MAX_ARG_LENGTH = 400;
/** tool result 的最大顯示長度 */
const MAX_RESULT_LENGTH = 800;

// ── 工具函式 ─────────────────────────────────────────────────────────────────

function extractTextContent(content: Message['content']): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return content
            .filter(p => p?.type === 'text' && typeof p.text === 'string')
            .map(p => p.text)
            .join('\n');
    }
    return '';
}

function trimIfLong(text: string, max: number): string {
    if (text.length <= max) return text;
    return text.slice(0, max) + `\n...[省略 ${text.length - max} 字元]`;
}

// ── 主要匯出 ─────────────────────────────────────────────────────────────────

/**
 * 將 OpenAI messages 陣列轉換為 gemini-friendly 的純文字提示。
 *
 * 設計原則：
 * 1. system 訊息獨立放在最上方
 * 2. 其餘對話使用 XML-like 標籤，讓 gemini 更容易理解角色切換
 * 3. Tool call arguments 過長時截斷，避免 context 膨脹
 */
export function flattenMessages(messages: Message[]): string {
    const parts: string[] = [];

    // 1. 提取並優先輸出 system 訊息
    const systemMsgs = messages.filter(m => m.role === 'system');
    const otherMsgs = messages.filter(m => m.role !== 'system');

    if (systemMsgs.length > 0) {
        const systemContent = systemMsgs.map(m => extractTextContent(m.content)).join('\n');
        parts.push(`<system>\n${systemContent}\n</system>`);
    }

    // 2. 其餘對話
    for (const m of otherMsgs) {

        // tool 結果訊息
        if (m.role === 'tool') {
            const raw = extractTextContent(m.content) || JSON.stringify(m.content);
            const trimmed = trimIfLong(raw, MAX_RESULT_LENGTH);
            parts.push(`<tool_result>\n${trimmed}\n</tool_result>`);
            continue;
        }

        // assistant 含有 tool_calls
        if (m.role === 'assistant' && m.tool_calls?.length) {
            const callsStr = m.tool_calls.map(tc => {
                const name = tc.function?.name ?? 'unknown';
                const rawArgs = tc.function?.arguments ?? '{}';
                const args = trimIfLong(rawArgs, MAX_ARG_LENGTH);
                return `  called: ${name}(${args})`;
            }).join('\n');
            const textContent = extractTextContent(m.content);
            const body = textContent ? `${textContent}\n${callsStr}` : callsStr;
            parts.push(`<assistant>\n${body}\n</assistant>`);
            continue;
        }

        // 一般 user / assistant 訊息
        const content = extractTextContent(m.content);
        parts.push(`<${m.role}>\n${content}\n</${m.role}>`);
    }

    return parts.join('\n\n');
}

/** 將 OpenAI tools 定義注入系統提示，指示 gemini 使用 TOOL_CALL: 格式 */
export function buildPromptWithTools(flatMessages: string, tools: any[]): string {
    if (!tools || tools.length === 0) return flatMessages;

    const toolDescriptions = tools.map(t => {
        const f = t.function;
        const firstLine = (f.description || '').split('\n')[0].substring(0, 120);
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

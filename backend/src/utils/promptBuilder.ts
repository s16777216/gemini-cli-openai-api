import type { Message } from "../schemas/chat";

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

// ── 主要匯出 ─────────────────────────────────────────────────────────────────

/**
 * 將 OpenAI messages 陣列轉換為 gemini-friendly 的純文字提示。
 *
 * 設計原則：
 * 1. system 訊息獨立放在最上方
 * 2. 其餘對話使用 XML-like 標籤，讓 gemini 更容易理解角色切換
 * 3. 完整保留 Tool call 紀錄，維持 Context 記憶
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
            parts.push(`<tool_result>\n${raw}\n</tool_result>`);
            continue;
        }

        // assistant 含有 tool_calls
        if (m.role === 'assistant' && m.tool_calls?.length) {
            const callsListStr = m.tool_calls.map(tc => {
                const name = tc.function?.name ?? 'unknown';
                const argsStr = typeof tc.function?.arguments === 'string'
                    ? tc.function.arguments || '{}'
                    : JSON.stringify(tc.function?.arguments ?? {});
                return `{"name":"${name}","arguments":${argsStr}}`;
            }).join(', ');
            const callsStr = `<tool_calls>[${callsListStr}]</tool_calls>`;
            
            const textContent = extractTextContent(m.content);
            const body = textContent ? `${textContent}\n${callsStr}` : callsStr;
            parts.push(`<assistant>\n${body}\n</assistant>`);
            continue;
        }

        // 一般 user / assistant 訊息
        const content = extractTextContent(m.content);
        if (content) {
            parts.push(`<${m.role}>\n${content}\n</${m.role}>`);
        }
    }

    return parts.join('\n\n');
}

/** 將 OpenAI tools 定義注入系統提示，指示 gemini 使用 <tool_calls> 陣列格式 */
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

You have been given a task. If completing it requires performing one or more actions (such as creating files, running commands, reading files etc.), you MUST request those actions by outputting a JSON array wrapped in <tool_calls> tags at the VERY END of your response.

Format for requesting actions (output this as plain text, do not call any functions natively):
<tool_calls>[{"name":"<action_name>","arguments":<json_object_with_parameters>}, ...]</tool_calls>

Available actions:
${toolDescriptions}

Rules:
- You can explain your thoughts first, then output the <tool_calls> block at the end.
- You can request multiple actions at once by putting multiple objects in the array.
- When you want to write a file: <tool_calls>[{"name":"write","arguments":{"filePath":"...","content":"..."}}]</tool_calls>
- When you want to run a shell command: <tool_calls>[{"name":"bash","arguments":{"command":"...","description":"..."}}]</tool_calls>
- When you want to read a file: <tool_calls>[{"name":"read","arguments":{"filePath":"..."}}]</tool_calls>
- After a tool result is given back to you, continue with the next action or provide your final reasoning.
- If no action is needed, just respond with your answer normally and do NOT output <tool_calls>.
=== END FORMAT INSTRUCTIONS ===

`;

    return toolInstruction + flatMessages;
}

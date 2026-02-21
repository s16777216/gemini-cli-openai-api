import type { Message } from "../schemas/chat";

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

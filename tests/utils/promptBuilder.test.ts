import { describe, test, expect } from "bun:test";
import { flattenMessages, buildPromptWithTools } from "../../src/utils/promptBuilder";
import type { Message } from "../../src/schemas/chat";

describe("flattenMessages", () => {
    test("一般 user + assistant 訊息", () => {
        const messages: Message[] = [
            { role: "user", content: "你好" },
            { role: "assistant", content: "您好！" },
        ];
        const result = flattenMessages(messages);
        expect(result).toBe("User: 你好\n\nAssistant: 您好！");
    });

    test("system 訊息", () => {
        const messages: Message[] = [
            { role: "system", content: "你是一個助理" },
        ];
        expect(flattenMessages(messages)).toBe("System: 你是一個助理");
    });

    test("tool 結果訊息", () => {
        const messages: Message[] = [
            { role: "tool", content: "檔案已寫入", tool_call_id: "call_123" },
        ];
        expect(flattenMessages(messages)).toBe("Tool Result: 檔案已寫入");
    });

    test("tool content 為物件時 JSON 序列化", () => {
        const messages: Message[] = [
            { role: "tool", content: { success: true } as any },
        ];
        expect(flattenMessages(messages)).toBe('Tool Result: {"success":true}');
    });

    test("assistant 訊息附帶 tool_calls", () => {
        const messages: Message[] = [{
            role: "assistant",
            content: null,
            tool_calls: [{
                function: { name: "write", arguments: '{"filePath":"/a.md","content":"hi"}' }
            }]
        }];
        const result = flattenMessages(messages);
        expect(result).toContain("Called: write");
    });

    test("content 為陣列（多模態格式）只取 text 部分", () => {
        const messages: Message[] = [{
            role: "user",
            content: [
                { type: "text", text: "請分析這張圖" },
                { type: "image_url", url: "http://..." },
            ] as any,
        }];
        expect(flattenMessages(messages)).toBe("User: 請分析這張圖");
    });

    test("content 為 null 時不崩潰", () => {
        const messages: Message[] = [{ role: "assistant", content: null }];
        expect(flattenMessages(messages)).toBe("Assistant: ");
    });
});

describe("buildPromptWithTools", () => {
    const fakeTool = {
        type: "function",
        function: {
            name: "write",
            description: "Write a file to the filesystem",
            parameters: {
                required: ["filePath", "content"],
                properties: {
                    filePath: { type: "string" },
                    content: { type: "string" },
                },
            },
        },
    };

    test("沒有 tools 時直接回傳原始訊息", () => {
        const result = buildPromptWithTools("User: hello", []);
        expect(result).toBe("User: hello");
    });

    test("有 tools 時會加入工具說明前綴", () => {
        const result = buildPromptWithTools("User: hello", [fakeTool]);
        expect(result).toContain("TOOL_CALL:");
        expect(result).toContain("write");
        expect(result).toContain("User: hello");
    });

    test("工具說明包含必要參數名稱", () => {
        const result = buildPromptWithTools("", [fakeTool]);
        expect(result).toContain("filePath");
        expect(result).toContain("content");
    });

    test("工具說明截斷過長描述（120 字元）", () => {
        const longDescTool = {
            ...fakeTool,
            function: {
                ...fakeTool.function,
                description: "A".repeat(200),
            },
        };
        const result = buildPromptWithTools("", [longDescTool]);
        // description 第一行最多 120 字元
        const lines = result.split('\n');
        const toolLine = lines.find(l => l.includes("write("));
        expect(toolLine!.length).toBeLessThanOrEqual(200); // 不應包含 200 個 A
        expect(toolLine).toContain("A".repeat(120));
    });
});

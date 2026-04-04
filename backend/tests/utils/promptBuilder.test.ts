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
        expect(result).toContain("<user>\n你好\n</user>");
        expect(result).toContain("<assistant>\n您好！\n</assistant>");
    });

    test("system 訊息移到最前並用 <system> 包裝", () => {
        const messages: Message[] = [
            { role: "system", content: "你是一個助理" },
        ];
        const result = flattenMessages(messages);
        expect(result).toBe("<system>\n你是一個助理\n</system>");
    });

    test("tool 結果訊息用 <tool_result> 包裝", () => {
        const messages: Message[] = [
            { role: "tool", content: "檔案已寫入", tool_call_id: "call_123" },
        ];
        expect(flattenMessages(messages)).toContain("<tool_result>\n檔案已寫入\n</tool_result>");
    });

    test("tool content 為物件時 JSON 序列化", () => {
        const messages: Message[] = [
            { role: "tool", content: { success: true } as any },
        ];
        expect(flattenMessages(messages)).toContain('{"success":true}');
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
        expect(result).toContain('{"name":"write","arguments":{"filePath":"/a.md","content":"hi"}}');
        expect(result).toContain("<assistant>");
    });

    test("content 為陣列（多模態格式）只取 text 部分", () => {
        const messages: Message[] = [{
            role: "user",
            content: [
                { type: "text", text: "請分析這張圖" },
                { type: "image_url", url: "http://..." },
            ] as any,
        }];
        expect(flattenMessages(messages)).toContain("請分析這張圖");
    });

    test("content 為 null 時不崩潰", () => {
        const messages: Message[] = [{ role: "assistant", content: null }];
        const result = flattenMessages(messages);
        expect(result).toBe("");
    });

    test("system 在混合訊息中排在最前", () => {
        const messages: Message[] = [
            { role: "user", content: "hi" },
            { role: "system", content: "系統提示" },
        ];
        const result = flattenMessages(messages);
        expect(result.indexOf("<system>")).toBeLessThan(result.indexOf("<user>"));
    });

    test("長 tool call arguments 不再被截斷", () => {
        const longArgs = JSON.stringify({ content: "x".repeat(1000) });
        const messages: Message[] = [{
            role: "assistant",
            content: null,
            tool_calls: [{ function: { name: "write", arguments: longArgs } }]
        }];
        const result = flattenMessages(messages);
        expect(result).not.toContain("[省略");
        expect(result).toContain("x".repeat(1000));
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
        const result = buildPromptWithTools("<user>\nhello\n</user>", [fakeTool]);
        expect(result).toContain("<tool_calls>");
        expect(result).toContain("write");
        expect(result).toContain("hello");
    });

    test("工具說明包含必要參數名稱", () => {
        const result = buildPromptWithTools("", [fakeTool]);
        expect(result).toContain("filePath");
        expect(result).toContain("content");
    });
});

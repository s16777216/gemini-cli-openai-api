import { describe, test, expect } from "bun:test";
import { ChatCompletionSchema, MessageSchema } from "../../src/schemas/chat";

describe("MessageSchema", () => {
    test("基本 user 訊息", () => {
        const r = MessageSchema.safeParse({ role: "user", content: "hi" });
        expect(r.success).toBe(true);
    });

    test("content 為 null", () => {
        const r = MessageSchema.safeParse({ role: "assistant", content: null });
        expect(r.success).toBe(true);
    });

    test("含 tool_calls 的 assistant 訊息", () => {
        const r = MessageSchema.safeParse({
            role: "assistant",
            content: null,
            tool_calls: [{ id: "call_1", type: "function", function: { name: "write", arguments: "{}" } }],
        });
        expect(r.success).toBe(true);
    });

    test("tool 角色含 tool_call_id", () => {
        const r = MessageSchema.safeParse({
            role: "tool",
            content: "done",
            tool_call_id: "call_1",
        });
        expect(r.success).toBe(true);
    });

    test("缺少 role 欄位應驗證失敗", () => {
        const r = MessageSchema.safeParse({ content: "hi" });
        expect(r.success).toBe(false);
    });
});

describe("ChatCompletionSchema", () => {
    const baseRequest = {
        model: "gemini-2.5-flash",
        messages: [{ role: "user", content: "hello" }],
    };

    test("最小合法請求", () => {
        expect(ChatCompletionSchema.safeParse(baseRequest).success).toBe(true);
    });

    test("含 tools 與 tool_choice 的請求", () => {
        const r = ChatCompletionSchema.safeParse({
            ...baseRequest,
            tools: [{ type: "function", function: { name: "write" } }],
            tool_choice: "auto",
            stream: true,
        });
        expect(r.success).toBe(true);
    });

    test("model 為選填", () => {
        const r = ChatCompletionSchema.safeParse({ messages: [{ role: "user", content: "hi" }] });
        expect(r.success).toBe(true);
    });

    test("messages 為空陣列應通過（由業務層判斷）", () => {
        const r = ChatCompletionSchema.safeParse({ messages: [] });
        expect(r.success).toBe(true);
    });

    test("缺少 messages 欄位應驗證失敗", () => {
        const r = ChatCompletionSchema.safeParse({ model: "gemini-2.5-flash" });
        expect(r.success).toBe(false);
    });
});

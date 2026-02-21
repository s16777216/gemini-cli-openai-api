import { describe, test, expect } from "bun:test";
import { toSSEChunk } from "../../src/utils/sseFormatter";

describe("toSSEChunk", () => {
    test("一般文字 chunk 結構正確", () => {
        const raw = toSSEChunk("hello", "gemini-2.5-flash");
        expect(raw).toStartWith("data: ");
        expect(raw).toEndWith("\n\n");

        const payload = JSON.parse(raw.slice(6, -2));
        expect(payload.object).toBe("chat.completion.chunk");
        expect(payload.model).toBe("gemini-2.5-flash");
        expect(payload.choices[0].delta.content).toBe("hello");
        expect(payload.choices[0].finish_reason).toBeNull();
    });

    test("finish_reason=stop 時 delta 為空物件", () => {
        const raw = toSSEChunk("", "gemini-2.5-flash", "stop");
        const payload = JSON.parse(raw.slice(6, -2));
        expect(payload.choices[0].delta).toEqual({});
        expect(payload.choices[0].finish_reason).toBe("stop");
    });

    test("finish_reason=tool_calls 時 delta 為空物件", () => {
        const raw = toSSEChunk("", "my-model", "tool_calls");
        const payload = JSON.parse(raw.slice(6, -2));
        expect(payload.choices[0].finish_reason).toBe("tool_calls");
        expect(payload.choices[0].delta).toEqual({});
    });

    test("包含必要的 id、created 欄位", () => {
        const payload = JSON.parse(toSSEChunk("x", "m").slice(6, -2));
        expect(payload.id).toStartWith("chatcmpl-");
        expect(typeof payload.created).toBe("number");
    });
});

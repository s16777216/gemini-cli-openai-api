import { describe, test, expect } from "bun:test";
import { splitLines, flushToolOrText } from "../../src/utils/chatStream";

describe("splitLines", () => {
    test("正常切行並過濾空行", () => {
        expect(splitLines("a\n\nb\nc")).toEqual(["a", "b", "c"]);
    });

    test("全空白行回傳空陣列", () => {
        expect(splitLines("   \n  \n")).toEqual([]);
    });

    test("單行無換行符號", () => {
        expect(splitLines("hello")).toEqual(["hello"]);
    });

    test("空字串回傳空陣列", () => {
        expect(splitLines("")).toEqual([]);
    });
});

describe("flushToolOrText", () => {
    /** 建立一個收集寫入內容的 mock stream */
    function makeMockStream() {
        const written: string[] = [];
        return {
            stream: { write: async (data: string) => { written.push(data); } },
            written,
        };
    }

    test("純文字內容：送出 content chunk + stop + DONE", async () => {
        const { stream, written } = makeMockStream();
        await flushToolOrText(stream, "這是一段回答", "test-model");

        expect(written).toHaveLength(3);
        // chunk 1: content
        const payload1 = JSON.parse(written[0]!.slice(6, -2));
        expect(payload1.choices[0].delta.content).toBe("這是一段回答");
        // chunk 2: stop
        const payload2 = JSON.parse(written[1]!.slice(6, -2));
        expect(payload2.choices[0].finish_reason).toBe("stop");
        // chunk 3: DONE
        expect(written[2]).toBe("data: [DONE]\n\n");
    });

    test("空內容：只送 stop + DONE（不送空 content chunk）", async () => {
        const { stream, written } = makeMockStream();
        await flushToolOrText(stream, "", "test-model");

        expect(written).toHaveLength(2);
        const payload = JSON.parse(written[0]!.slice(6, -2));
        expect(payload.choices[0].finish_reason).toBe("stop");
        expect(written[1]).toBe("data: [DONE]\n\n");
    });

    test("包含 TOOL_CALL: 標記：送出 tool_calls 格式（3 個 chunk + DONE）", async () => {
        const { stream, written } = makeMockStream();
        const toolCallLine = 'TOOL_CALL:{"name":"write","arguments":{"filePath":"/a.md","content":"hi"}}';
        await flushToolOrText(stream, toolCallLine, "test-model");

        expect(written).toHaveLength(4); // chunk1(name) + chunk2(args) + chunk3(finish) + DONE
        // 最後一個一定是 DONE
        expect(written[written.length - 1]).toBe("data: [DONE]\n\n");
        // 第三個 chunk finish_reason = tool_calls
        const finishChunk = JSON.parse(written[2]!.slice(6, -2));
        expect(finishChunk.choices[0].finish_reason).toBe("tool_calls");
    });

    test("TOOL_CALL 前有前綴文字也能偵測到", async () => {
        const { stream, written } = makeMockStream();
        const content = '好的，我來寫檔案：\nTOOL_CALL:{"name":"bash","arguments":{"command":"ls"}}';
        await flushToolOrText(stream, content, "test-model");

        // 應走 tool_calls 路徑
        const finishChunk = JSON.parse(written[2]!.slice(6, -2));
        expect(finishChunk.choices[0].finish_reason).toBe("tool_calls");
    });
});

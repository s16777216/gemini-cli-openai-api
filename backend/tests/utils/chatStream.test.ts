import { describe, test, expect } from "bun:test";
import { splitLines } from "../../src/utils/chatStream";

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

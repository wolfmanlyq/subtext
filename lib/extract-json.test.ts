import { test, expect } from "vitest";
import { extractJson } from "./extract-json";

test("解析纯 JSON", () => {
  expect(extractJson('{"a":1}')).toEqual({ a: 1 });
});

test("解析被 ```json 代码块包裹的 JSON", () => {
  expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
});

test("解析前后有多余文字的 JSON", () => {
  expect(extractJson('好的,结果如下:{"a":1} 完毕')).toEqual({ a: 1 });
});

test("无 JSON 时抛错", () => {
  expect(() => extractJson("没有大括号")).toThrow();
});

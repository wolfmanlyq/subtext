import { test, expect, vi } from "vitest";
import { z } from "zod";
import { callStructured, toInputSchema, BadModelOutput } from "./tool-call";

const S = z.object({ keyInsight: z.string(), emotionIntensity: z.string() });

function clientReturning(content: unknown) {
  const create = vi.fn(async () => ({ content }));
  return { client: { messages: { create } }, create };
}

const base = {
  model: "claude-opus-4-8", maxTokens: 600, system: "sys", content: "user",
  schema: S, toolName: "emit_insight", toolDescription: "desc",
} as const;

test("toInputSchema 产出 object schema 且不含 $schema", () => {
  const js = toInputSchema(S);
  expect(js.type).toBe("object");
  expect((js as { properties?: unknown }).properties).toBeTruthy();
  expect((js as Record<string, unknown>)["$schema"]).toBeUndefined();
});

test("从 tool_use.input 取结构化结果", async () => {
  const { client, create } = clientReturning([
    { type: "tool_use", name: "emit_insight", input: { keyInsight: "k", emotionIntensity: "中高" } },
  ]);
  const out = await callStructured({ ...base, client });
  expect(out).toEqual({ keyInsight: "k", emotionIntensity: "中高" });
  // 发送了强制 tool_choice
  const arg = create.mock.calls[0][0];
  expect(arg.tool_choice).toEqual({ type: "tool", name: "emit_insight" });
  expect(arg.tools[0].input_schema.type).toBe("object");
});

test("中转重命名 tool 时仍能取(不按 name 匹配)", async () => {
  const { client } = clientReturning([
    { type: "thinking", thinking: "" },
    { type: "tool_use", name: "CompatEmitInsight39b185", input: { keyInsight: "k", emotionIntensity: "中" } },
  ]);
  const out = await callStructured({ ...base, client });
  expect(out.keyInsight).toBe("k");
});

test("没有 tool_use 块(只有闲聊文本)抛 BadModelOutput", async () => {
  const { client } = clientReturning([{ type: "text", text: "我需要确认一下……" }]);
  await expect(callStructured({ ...base, client })).rejects.toBeInstanceOf(BadModelOutput);
});

test("tool_use.input 不符合 schema 抛 BadModelOutput", async () => {
  const { client } = clientReturning([{ type: "tool_use", name: "x", input: { keyInsight: 123 } }]);
  await expect(callStructured({ ...base, client })).rejects.toBeInstanceOf(BadModelOutput);
});

test("SDK 连接错向上传播(不转成 BadModelOutput)", async () => {
  const create = vi.fn(async () => { throw new Error("boom"); });
  await expect(callStructured({ ...base, client: { messages: { create } } })).rejects.toThrow("boom");
});

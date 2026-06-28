import { test, expect, vi, beforeEach } from "vitest";

const createMock = vi.fn();
const getClientMock = vi.fn(() => ({ messages: { create: createMock } }));
vi.mock("@/lib/anthropic", () => ({
  MODEL: "claude-opus-4-8",
  getClient: () => getClientMock(),
}));

import { POST } from "./route";
import { DEMO_INPUT } from "@/lib/demo";

beforeEach(() => {
  createMock.mockReset();
  getClientMock.mockReset();
  getClientMock.mockImplementation(() => ({ messages: { create: createMock } }));
});

function req(body: unknown): Request {
  return new Request("http://localhost/api/insight", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
function fakeToolMessage(input: unknown) {
  return { content: [{ type: "tool_use", name: "x", input }] };
}

const insight = { keyInsight: "k", emotionIntensity: "中高" };

test("成功返回 keyInsight+emotionIntensity", async () => {
  createMock.mockResolvedValue(fakeToolMessage(insight));
  const res = await POST(req(DEMO_INPUT));
  expect(res.status).toBe(200);
  const json = await res.json();
  expect(json.keyInsight).toBe("k");
  expect(json.emotionIntensity).toBe("中高");
});

test("缺 feedback 返回 400", async () => {
  const res = await POST(req({ ...DEMO_INPUT, feedback: "" }));
  expect(res.status).toBe(400);
});

test("首次坏内容自动重试一次后成功", async () => {
  createMock
    .mockResolvedValueOnce({ content: [{ type: "text", text: "闲聊" }] })
    .mockResolvedValueOnce(fakeToolMessage(insight));
  const res = await POST(req(DEMO_INPUT));
  expect(res.status).toBe(200);
  expect(createMock).toHaveBeenCalledTimes(2);
});

test("两次坏内容返回友好提示", async () => {
  createMock.mockResolvedValue({ content: [{ type: "text", text: "闲聊" }] });
  const res = await POST(req(DEMO_INPUT));
  expect(res.status).toBe(500);
  const json = await res.json();
  expect(json.error).toMatch(/异常|请重试/);
  expect(json.error).not.toMatch(/invalid_type|expected/);
  expect(createMock).toHaveBeenCalledTimes(2);
});

test("连接错误返回 500 含错误信息", async () => {
  createMock.mockRejectedValue(new Error("boom"));
  const res = await POST(req(DEMO_INPUT));
  expect(res.status).toBe(500);
  const json = await res.json();
  expect(json.error).toMatch(/boom/);
  expect(createMock).toHaveBeenCalledTimes(1);
});

test("发送请求包含 tool_choice.type === 'tool'", async () => {
  createMock.mockResolvedValue(fakeToolMessage(insight));
  await POST(req(DEMO_INPUT));
  expect(createMock.mock.calls[0][0].tool_choice.type).toBe("tool");
});

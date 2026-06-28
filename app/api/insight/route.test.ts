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
function fakeMessage(text: string) {
  return { content: [{ type: "text", text }] };
}

const insight = { keyInsight: "客户不是觉得画面不好看,而是担心好看但不卖货。", emotionIntensity: "中高" };

test("成功返回 keyInsight+emotionIntensity", async () => {
  createMock.mockResolvedValue(fakeMessage(JSON.stringify(insight)));
  const res = await POST(req(DEMO_INPUT));
  expect(res.status).toBe(200);
  const json = await res.json();
  expect(json.emotionIntensity).toBe("中高");
});

test("缺 feedback 返回 400", async () => {
  const res = await POST(req({ ...DEMO_INPUT, feedback: "" }));
  expect(res.status).toBe(400);
});

test("首次坏内容自动重试一次后成功", async () => {
  createMock
    .mockResolvedValueOnce(fakeMessage("中转抽风"))
    .mockResolvedValueOnce(fakeMessage(JSON.stringify(insight)));
  const res = await POST(req(DEMO_INPUT));
  expect(res.status).toBe(200);
  expect(createMock).toHaveBeenCalledTimes(2);
});

test("两次坏内容返回友好提示", async () => {
  createMock.mockResolvedValue(fakeMessage("不是 JSON"));
  const res = await POST(req(DEMO_INPUT));
  expect(res.status).toBe(500);
  const json = await res.json();
  expect(json.error).toMatch(/异常|请重试/);
  expect(json.error).not.toMatch(/invalid_type|expected/);
});

import { test, expect, vi, beforeEach } from "vitest";

const createMock = vi.fn();
const getClientMock = vi.fn(() => ({ messages: { create: createMock } }));
vi.mock("@/lib/anthropic", () => ({
  MODEL: "claude-opus-4-8",
  getClient: () => getClientMock(),
}));

import { POST } from "./route";

beforeEach(() => {
  createMock.mockReset();
  getClientMock.mockReset();
  getClientMock.mockImplementation(() => ({ messages: { create: createMock } }));
});

function req(body: unknown): Request {
  return new Request("http://localhost/api/prototypes", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function fakeMessage(text: string) {
  return { content: [{ type: "text", text }] };
}

test("解析模型返回的 prototypes JSON", async () => {
  const payload = {
    prototypes: [
      {
        strategy: "强化卖点",
        html: "<h1>A</h1>",
        solvesFeedback: "卖点",
        risk: "无",
        priority: "高",
      },
    ],
  };
  createMock.mockResolvedValue(fakeMessage(JSON.stringify(payload)));
  const res = await POST(req({ needSummary: "x", rawFeedback: "y" }));
  expect(res.status).toBe(200);
  const json = await res.json();
  expect(json.prototypes[0].html).toBe("<h1>A</h1>");
});

test("模型返回被代码块包裹的 JSON 也能解析", async () => {
  const payload = { prototypes: [] };
  createMock.mockResolvedValue(
    fakeMessage("```json\n" + JSON.stringify(payload) + "\n```"),
  );
  const res = await POST(req({ needSummary: "x", rawFeedback: "y" }));
  expect(res.status).toBe(200);
});

test("缺参数返回 400", async () => {
  const res = await POST(req({ needSummary: "" }));
  expect(res.status).toBe(400);
});

test("SDK 调用失败返回 500", async () => {
  getClientMock.mockImplementation(() => {
    throw new Error("boom");
  });
  const res = await POST(req({ needSummary: "x", rawFeedback: "y" }));
  expect(res.status).toBe(500);
});

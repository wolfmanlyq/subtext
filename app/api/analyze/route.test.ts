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
  return new Request("http://localhost/api/analyze", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function fakeMessage(text: string) {
  return { content: [{ type: "text", text }] };
}

const validCard = {
  needMoreInfo: false,
  oneLineTranslation: "好看但不卖货",
  explicitNeeds: ["卖点更明确"],
  implicitNeeds: ["促进到店"],
  coreConflict: "年轻化 vs 质感",
  feedbackTypes: ["产品卖点"],
  items: [{ desc: "放大产品杯", priority: "必须修改", roles: ["设计"], risk: "削弱氛围" }],
  questionsToAsk: [],
  replyScript: "收到",
};

test("解析并校验模型返回的需求卡 JSON", async () => {
  createMock.mockResolvedValue(fakeMessage(JSON.stringify(validCard)));
  const res = await POST(req(DEMO_INPUT));
  expect(res.status).toBe(200);
  const json = await res.json();
  expect(json.replyScript).toBe("收到");
  expect(json.items[0].priority).toBe("必须修改");
});

test("模型返回被代码块包裹的 JSON 也能解析", async () => {
  createMock.mockResolvedValue(
    fakeMessage("```json\n" + JSON.stringify(validCard) + "\n```"),
  );
  const res = await POST(req(DEMO_INPUT));
  expect(res.status).toBe(200);
});

test("缺 feedback 返回 400", async () => {
  const res = await POST(req({ ...DEMO_INPUT, feedback: "" }));
  expect(res.status).toBe(400);
});

test("模型输出不符合 schema 时返回 500", async () => {
  createMock.mockResolvedValue(
    fakeMessage(JSON.stringify({ ...validCard, items: [{ desc: "x", priority: "随便改", roles: [], risk: "" }] })),
  );
  const res = await POST(req(DEMO_INPUT));
  expect(res.status).toBe(500);
});

test("SDK 调用失败返回 500 且含可读信息", async () => {
  getClientMock.mockImplementation(() => {
    throw new Error("boom");
  });
  const res = await POST(req(DEMO_INPUT));
  expect(res.status).toBe(500);
  const json = await res.json();
  expect(json.error).toContain("boom");
});

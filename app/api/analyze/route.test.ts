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
  emotionIntensity: "中高",
  keyInsight: "客户不是觉得画面不好看,而是担心广告好看但不卖货。",
  realDemand: { explicit: ["卖点更明确"], implicit: ["促进到店"] },
  coreTension: [
    { left: "年轻化", right: "品牌质感", leftPercent: 65, rightPercent: 35, note: "想年轻又怕掉质感" },
  ],
  foresight: ["下一轮客户可能会问:用户为什么现在买"],
  evidence: ["客户先认可视觉好看 → 说明问题不是审美"],
  questionsToConfirm: [],
  nextActions: [{ role: "设计", title: "重排层级", detail: "放大产品杯", reason: "补产品吸引力" }],
  checklist: ["强化产品卖点"],
  clientReply: "收到",
};

test("解析并校验模型返回的需求卡 JSON", async () => {
  createMock.mockResolvedValue(fakeMessage(JSON.stringify(validCard)));
  const res = await POST(req(DEMO_INPUT));
  expect(res.status).toBe(200);
  const json = await res.json();
  expect(json.clientReply).toBe("收到");
  expect(json.nextActions[0].role).toBe("设计");
  expect(json.coreTension[0].leftPercent).toBe(65);
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
    fakeMessage(JSON.stringify({ needMoreInfo: false })),
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

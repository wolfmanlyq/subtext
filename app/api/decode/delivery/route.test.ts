import { test, expect, vi, beforeEach } from "vitest";

const createMock = vi.fn();
const getClientMock = vi.fn(() => ({ messages: { create: createMock } }));
vi.mock("@/lib/anthropic", () => ({ MODEL: "claude-opus-4-8", getClient: () => getClientMock() }));

import { POST } from "./route";
import { DEMO_INPUT } from "@/lib/demo";

beforeEach(() => {
  createMock.mockReset();
  getClientMock.mockReset();
  getClientMock.mockImplementation(() => ({ messages: { create: createMock } }));
});

function req(body: unknown): Request {
  return new Request("http://localhost/api/decode/delivery", { method: "POST", body: JSON.stringify(body) });
}
function fakeMessage(text: string) { return { content: [{ type: "text", text }] }; }

const core = {
  needMoreInfo: false,
  realDemand: { explicit: ["卖点更明确"], implicit: ["怕不卖货"] },
  coreTension: [{ left: "年轻化", right: "品牌质感", leftPercent: 65, rightPercent: 35, note: "n" }],
  foresight: ["f"],
  evidence: ["e"],
  questionsToConfirm: [],
};
const validDelivery = {
  clientReply: "收到,我们理解……",
  checklist: ["强化产品卖点"],
  nextActions: [{ role: "设计", title: "重排层级", detail: "放大产品杯", reason: "补吸引力" }],
};

test("正常:返回 Delivery,且 core 摘要进了 prompt", async () => {
  createMock.mockResolvedValue(fakeMessage(JSON.stringify(validDelivery)));
  const res = await POST(req({ ...DEMO_INPUT, core }));
  expect(res.status).toBe(200);
  expect((await res.json()).clientReply).toBe("收到,我们理解……");
  const sentUser = createMock.mock.calls[0][0].messages[0].content;
  expect(sentUser).toContain("怕不卖货"); // core.implicit 带入
});

test("缺 core 返回 400", async () => {
  const res = await POST(req(DEMO_INPUT));
  expect(res.status).toBe(400);
  expect(createMock).not.toHaveBeenCalled();
});

test("core 不合法返回 400", async () => {
  const res = await POST(req({ ...DEMO_INPUT, core: { realDemand: 123 } }));
  expect(res.status).toBe(400);
});

test("缺 feedback 返回 400", async () => {
  const res = await POST(req({ feedback: "", core }));
  expect(res.status).toBe(400);
});

test("首次坏内容重试一次后成功", async () => {
  createMock
    .mockResolvedValueOnce(fakeMessage("(抽风)"))
    .mockResolvedValueOnce(fakeMessage(JSON.stringify(validDelivery)));
  const res = await POST(req({ ...DEMO_INPUT, core }));
  expect(res.status).toBe(200);
  expect(createMock).toHaveBeenCalledTimes(2);
});

test("两次坏内容返回友好提示(不暴露 Zod 原文)", async () => {
  createMock.mockResolvedValue(fakeMessage("不是 JSON"));
  const res = await POST(req({ ...DEMO_INPUT, core }));
  expect(res.status).toBe(500);
  const json = await res.json();
  expect(json.error).toMatch(/模型返回内容异常|请重试/);
  expect(json.error).not.toMatch(/invalid_type|expected/);
  expect(createMock).toHaveBeenCalledTimes(2);
});

test("SDK 连接错返回 500(不重试)", async () => {
  createMock.mockImplementation(() => { throw new Error("boom"); });
  const res = await POST(req({ ...DEMO_INPUT, core }));
  expect(res.status).toBe(500);
  expect((await res.json()).error).toContain("boom");
  expect(createMock).toHaveBeenCalledTimes(1);
});

test("背景字段透传进模型 prompt", async () => {
  createMock.mockResolvedValue(fakeMessage(JSON.stringify(validDelivery)));
  await POST(req({ ...DEMO_INPUT, core, brandName: "某咖啡品牌", clientRole: "市场部" }));
  const sent = createMock.mock.calls[0][0].messages[0].content;
  expect(sent).toContain("某咖啡品牌");
  expect(sent).toContain("市场部");
});

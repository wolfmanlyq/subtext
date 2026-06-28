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
  coreTension: [{ left: "年轻化", right: "品牌质感", leftPercent: 65, rightPercent: 35, note: "x" }],
  foresight: ["下一轮会问为什么现在买"],
  evidence: ["客户先认可视觉好看 → 说明问题不是审美"],
  questionsToConfirm: [],
  nextActions: [{ role: "设计", title: "重排层级", detail: "放大产品杯", reason: "补吸引力" }],
  checklist: ["强化产品卖点"],
  clientReply: "收到",
};
const pdfAtt = { name: "brief.pdf", kind: "pdf", mediaType: "application/pdf", data: "QkFTRTY0" };

test("无附件:与现状一致,响应不含 attachmentsDropped", async () => {
  createMock.mockResolvedValue(fakeMessage(JSON.stringify(validCard)));
  const res = await POST(req(DEMO_INPUT));
  expect(res.status).toBe(200);
  const json = await res.json();
  expect(json.clientReply).toBe("收到");
  expect(json.attachmentsDropped).toBeUndefined();
});

test("带 PDF 附件:传给 SDK 的 content 含 document 块", async () => {
  createMock.mockResolvedValue(fakeMessage(JSON.stringify(validCard)));
  const res = await POST(req({ ...DEMO_INPUT, attachments: [pdfAtt] }));
  expect(res.status).toBe(200);
  const callArg = createMock.mock.calls[0][0];
  const content = callArg.messages[0].content;
  expect(Array.isArray(content)).toBe(true);
  expect(content.some((b: { type: string }) => b.type === "document")).toBe(true);
});

test("多模态失败:去掉文档块重试一次,成功并标记 attachmentsDropped", async () => {
  createMock
    .mockImplementationOnce(() => {
      throw new Error("messages.0.content.1: unsupported content block type document");
    })
    .mockResolvedValueOnce(fakeMessage(JSON.stringify(validCard)));
  const res = await POST(req({ ...DEMO_INPUT, attachments: [pdfAtt] }));
  expect(res.status).toBe(200);
  const json = await res.json();
  expect(json.attachmentsDropped).toBe(true);
  // 第二次调用不含 document 块
  const secondContent = createMock.mock.calls[1][0].messages[0].content;
  expect(secondContent.some((b: { type: string }) => b.type === "document")).toBe(false);
  // 恰好重试一次:共两次调用
  expect(createMock).toHaveBeenCalledTimes(2);
});

test("超体积附件返回 400", async () => {
  const big = { ...pdfAtt, data: "a".repeat(4 * 1024 * 1024 + 1) };
  const res = await POST(req({ ...DEMO_INPUT, attachments: [big] }));
  expect(res.status).toBe(400);
});

test("非法附件(kind 非枚举)返回 400", async () => {
  const bad = { ...pdfAtt, kind: "video" };
  const res = await POST(req({ ...DEMO_INPUT, attachments: [bad] }));
  expect(res.status).toBe(400);
});

test("缺 feedback 返回 400", async () => {
  const res = await POST(req({ ...DEMO_INPUT, feedback: "" }));
  expect(res.status).toBe(400);
});

test("无附件且 SDK 失败返回 500(不重试)", async () => {
  createMock.mockImplementation(() => {
    throw new Error("boom");
  });
  const res = await POST(req(DEMO_INPUT));
  expect(res.status).toBe(500);
  const json = await res.json();
  expect(json.error).toContain("boom");
  // 无附件时不应触发降级重试:模型只被调用一次
  expect(createMock).toHaveBeenCalledTimes(1);
});

test("无附件:模型首次返回无效内容,自动重试一次后成功", async () => {
  createMock
    .mockResolvedValueOnce(fakeMessage("（中转抽风返回的空/无关内容)"))
    .mockResolvedValueOnce(fakeMessage(JSON.stringify(validCard)));
  const res = await POST(req(DEMO_INPUT));
  expect(res.status).toBe(200);
  const json = await res.json();
  expect(json.clientReply).toBe("收到");
  expect(createMock).toHaveBeenCalledTimes(2);
});

test("无附件:模型两次都返回无效内容,返回友好提示(不暴露 Zod 原文)", async () => {
  createMock.mockResolvedValue(fakeMessage("不是 JSON"));
  const res = await POST(req(DEMO_INPUT));
  expect(res.status).toBe(500);
  const json = await res.json();
  expect(json.error).toMatch(/模型返回内容异常|请重试/);
  expect(json.error).not.toMatch(/needMoreInfo|invalid_type|expected/);
  expect(createMock).toHaveBeenCalledTimes(2);
});

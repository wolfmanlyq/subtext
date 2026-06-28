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
  return new Request("http://localhost/api/decode/core", { method: "POST", body: JSON.stringify(body) });
}
function fakeToolMessage(input: unknown) {
  return { content: [{ type: "tool_use", name: "emit_core", input }] };
}

const validCore = {
  needMoreInfo: false,
  realDemand: { explicit: ["卖点更明确"], implicit: ["促进到店"] },
  coreTension: [{ left: "年轻化", right: "品牌质感", leftPercent: 65, rightPercent: 35, note: "x" }],
  foresight: ["下一轮会问为什么现在买"],
  evidence: ["客户先认可视觉好看 → 说明问题不是审美"],
  questionsToConfirm: [],
};
const pdfAtt = { name: "brief.pdf", kind: "pdf", mediaType: "application/pdf", data: "QkFTRTY0" };

test("无附件:返回 Core,不含 attachmentsDropped", async () => {
  createMock.mockResolvedValue(fakeToolMessage(validCore));
  const res = await POST(req(DEMO_INPUT));
  expect(res.status).toBe(200);
  const json = await res.json();
  expect(json.realDemand.explicit).toContain("卖点更明确");
  expect(json.attachmentsDropped).toBeUndefined();
  // assert tool_choice is set
  expect(createMock.mock.calls[0][0].tool_choice.type).toBe("tool");
});

test("带 PDF:content 含 document 块", async () => {
  createMock.mockResolvedValue(fakeToolMessage(validCore));
  const res = await POST(req({ ...DEMO_INPUT, attachments: [pdfAtt] }));
  expect(res.status).toBe(200);
  const content = createMock.mock.calls[0][0].messages[0].content;
  expect(content.some((b: { type: string }) => b.type === "document")).toBe(true);
  expect(createMock.mock.calls[0][0].tool_choice.type).toBe("tool");
});

test("多模态失败:去掉文档块重试一次,标记 attachmentsDropped", async () => {
  createMock
    .mockImplementationOnce(() => { throw new Error("unsupported content block type document"); })
    .mockResolvedValueOnce(fakeToolMessage(validCore));
  const res = await POST(req({ ...DEMO_INPUT, attachments: [pdfAtt] }));
  expect(res.status).toBe(200);
  const json = await res.json();
  expect(json.attachmentsDropped).toBe(true);
  const secondContent = createMock.mock.calls[1][0].messages[0].content;
  expect(secondContent.some((b: { type: string }) => b.type === "document")).toBe(false);
  expect(createMock).toHaveBeenCalledTimes(2);
});

test("超体积附件返回 400", async () => {
  const big = { ...pdfAtt, data: "a".repeat(4 * 1024 * 1024 + 1) };
  expect((await POST(req({ ...DEMO_INPUT, attachments: [big] }))).status).toBe(400);
});

test("缺 feedback 返回 400", async () => {
  expect((await POST(req({ ...DEMO_INPUT, feedback: "" }))).status).toBe(400);
});

test("多模态联网成功但 tool_use 缺失:去掉文档块重试一次,标记 attachmentsDropped", async () => {
  createMock
    .mockResolvedValueOnce({ content: [{ type: "text", text: "闲聊" }] })
    .mockResolvedValueOnce(fakeToolMessage(validCore));
  const res = await POST(req({ ...DEMO_INPUT, attachments: [pdfAtt] }));
  expect(res.status).toBe(200);
  const json = await res.json();
  expect(json.attachmentsDropped).toBe(true);
  const secondContent = createMock.mock.calls[1][0].messages[0].content;
  expect(secondContent.some((b: { type: string }) => b.type === "document")).toBe(false);
  expect(createMock).toHaveBeenCalledTimes(2);
});

test("无附件且 SDK 失败返回 500(不重试)", async () => {
  createMock.mockImplementation(() => { throw new Error("boom"); });
  const res = await POST(req(DEMO_INPUT));
  expect(res.status).toBe(500);
  expect((await res.json()).error).toContain("boom");
  expect(createMock).toHaveBeenCalledTimes(1);
});

test("无附件:首次坏内容,重试一次后成功", async () => {
  createMock
    .mockResolvedValueOnce({ content: [{ type: "text", text: "(中转抽风)" }] })
    .mockResolvedValueOnce(fakeToolMessage(validCore));
  const res = await POST(req(DEMO_INPUT));
  expect(res.status).toBe(200);
  expect(createMock).toHaveBeenCalledTimes(2);
});

test("无附件:两次坏内容,友好提示(不暴露 Zod 原文)", async () => {
  createMock.mockResolvedValue({ content: [{ type: "text", text: "不是 JSON" }] });
  const res = await POST(req(DEMO_INPUT));
  expect(res.status).toBe(500);
  const json = await res.json();
  expect(json.error).toMatch(/模型返回内容异常|请重试/);
  expect(json.error).not.toMatch(/invalid_type|expected|needMoreInfo/);
  expect(createMock).toHaveBeenCalledTimes(2);
});

test("背景字段透传进模型 prompt", async () => {
  createMock.mockResolvedValue(fakeToolMessage(validCore));
  await POST(req({ ...DEMO_INPUT, industry: "快消", brandName: "某咖啡品牌", clientRole: "老板" }));
  const sent = createMock.mock.calls[0][0].messages[0].content;
  const text = typeof sent === "string" ? sent : sent.map((b: { text?: string }) => b.text ?? "").join("");
  expect(text).toContain("快消");
  expect(text).toContain("某咖啡品牌");
  expect(text).toContain("老板");
});

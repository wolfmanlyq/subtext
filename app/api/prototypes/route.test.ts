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

const validPrototype = {
  name: "强化卖点版",
  strategy: "强化卖点",
  sampleCopy: "精心设计的文案",
  highlight: "核心亮点",
  recommend: "主推",
  html: "<h1>A</h1>",
};

function fakeToolUse(input: unknown) {
  return {
    content: [{ type: "tool_use", name: "emit_prototypes", id: "tu_1", input }],
  };
}

test("成功返回 prototypes 数组", async () => {
  createMock.mockResolvedValue(fakeToolUse({ prototypes: [validPrototype] }));
  const res = await POST(req({ needSummary: "x", rawFeedback: "y" }));
  expect(res.status).toBe(200);
  const json = await res.json();
  expect(Array.isArray(json.prototypes)).toBe(true);
  expect(json.prototypes[0].html).toBe("<h1>A</h1>");
});

test("缺 needSummary 返回 400", async () => {
  const res = await POST(req({ rawFeedback: "y" }));
  expect(res.status).toBe(400);
});

test("缺 rawFeedback 返回 400", async () => {
  const res = await POST(req({ needSummary: "x" }));
  expect(res.status).toBe(400);
});

test("首次坏输出,重试一次后成功(共 2 次调用)", async () => {
  // First call returns no tool_use block → BadModelOutput
  createMock
    .mockResolvedValueOnce({ content: [{ type: "text", text: "no tool" }] })
    .mockResolvedValueOnce(fakeToolUse({ prototypes: [validPrototype] }));
  const res = await POST(req({ needSummary: "x", rawFeedback: "y" }));
  expect(res.status).toBe(200);
  expect(createMock).toHaveBeenCalledTimes(2);
  const json = await res.json();
  expect(json.prototypes[0].name).toBe("强化卖点版");
});

test("两次坏输出返回友好 500(共 2 次调用,不暴露 Zod 错误信息)", async () => {
  createMock.mockResolvedValue({ content: [{ type: "text", text: "not a tool" }] });
  const res = await POST(req({ needSummary: "x", rawFeedback: "y" }));
  expect(res.status).toBe(500);
  const json = await res.json();
  expect(json.error).toMatch(/异常|请重试/);
  expect(json.error).not.toMatch(/ZodError/);
  expect(json.error).not.toMatch(/parse/);
  expect(createMock).toHaveBeenCalledTimes(2);
});

test("连接错误不重试,返回 500(共 1 次调用)", async () => {
  createMock.mockRejectedValue(new Error("connection refused"));
  const res = await POST(req({ needSummary: "x", rawFeedback: "y" }));
  expect(res.status).toBe(500);
  expect(createMock).toHaveBeenCalledTimes(1);
});

test("调用时使用 tool_choice.type === 'tool'", async () => {
  createMock.mockResolvedValue(fakeToolUse({ prototypes: [validPrototype] }));
  await POST(req({ needSummary: "x", rawFeedback: "y" }));
  const callArg = createMock.mock.calls[0][0] as Record<string, unknown>;
  expect((callArg.tool_choice as { type: string }).type).toBe("tool");
});

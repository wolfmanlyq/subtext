import { test, expect, vi, beforeEach } from "vitest";

const parseMock = vi.fn();
const getClientMock = vi.fn(() => ({ messages: { parse: parseMock } }));
vi.mock("@/lib/anthropic", () => ({
  MODEL: "claude-opus-4-8",
  getClient: () => getClientMock(),
}));

import { POST } from "./route";
import { DEMO_INPUT } from "@/lib/demo";

beforeEach(() => {
  parseMock.mockReset();
  getClientMock.mockReset();
  getClientMock.mockImplementation(() => ({ messages: { parse: parseMock } }));
});

function req(body: unknown): Request {
  return new Request("http://localhost/api/analyze", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

test("成功返回需求卡 JSON", async () => {
  parseMock.mockResolvedValue({
    parsed_output: {
      needMoreInfo: false,
      oneLineTranslation: "x",
      explicitNeeds: [],
      implicitNeeds: [],
      coreConflict: "",
      feedbackTypes: [],
      items: [],
      questionsToAsk: [],
      replyScript: "好的",
    },
  });
  const res = await POST(req(DEMO_INPUT));
  expect(res.status).toBe(200);
  const json = await res.json();
  expect(json.replyScript).toBe("好的");
});

test("缺 feedback 返回 400", async () => {
  const res = await POST(req({ ...DEMO_INPUT, feedback: "" }));
  expect(res.status).toBe(400);
});

test("SDK 调用失败返回 500 且含可读信息", async () => {
  getClientMock.mockImplementation(() => {
    throw new Error("boom");
  });
  const res = await POST(req(DEMO_INPUT));
  expect(res.status).toBe(500);
  const json = await res.json();
  expect(json.error).toBeTruthy();
  expect(json.error).toContain("boom");
});

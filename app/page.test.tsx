import { test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Page from "./page";

beforeEach(() => vi.restoreAllMocks());

test("提交后展示行动卡与小样", async () => {
  const card = {
    needMoreInfo: false,
    oneLineTranslation: "好看但不卖货",
    explicitNeeds: [],
    implicitNeeds: [],
    coreConflict: "",
    feedbackTypes: [],
    items: [],
    questionsToAsk: [],
    replyScript: "收到",
  };
  const protos = {
    prototypes: [
      { strategy: "强化卖点", html: "<h1>A</h1>", solvesFeedback: "x", risk: "y", priority: "高" },
    ],
  };
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => card })
      .mockResolvedValueOnce({ ok: true, json: async () => protos }),
  );

  render(<Page />);
  await userEvent.click(screen.getByRole("button", { name: /示例/ }));
  await userEvent.click(screen.getByRole("button", { name: /生成行动卡/ }));

  await waitFor(() => expect(screen.getByText("好看但不卖货")).toBeInTheDocument());
  await waitFor(() => expect(screen.getByText("强化卖点")).toBeInTheDocument());
});

test("analyze 失败时展示错误", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValueOnce({ ok: false, json: async () => ({ error: "炸了" }) }),
  );
  render(<Page />);
  await userEvent.click(screen.getByRole("button", { name: /示例/ }));
  await userEvent.click(screen.getByRole("button", { name: /生成行动卡/ }));
  await waitFor(() => expect(screen.getByText(/炸了/)).toBeInTheDocument());
});

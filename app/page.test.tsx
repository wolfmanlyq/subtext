import { test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Page from "./page";

beforeEach(() => vi.restoreAllMocks());

const card = {
  needMoreInfo: false,
  emotionIntensity: "中等偏强",
  agentJudgment: "复合修改,不是单点意见",
  feedbackTypes: ["产品卖点"],
  explicitNeeds: ["卖点更明确"],
  implicitNeeds: ["促进到店"],
  conflicts: [{ left: "想要年轻化", right: "不能太网红" }],
  risks: ["只加强活动信息会显廉价"],
  evidence: ["客户先认可视觉好看"],
  questionsToAsk: [],
  roleActions: [{ role: "设计", title: "重排层级", desc: "放大产品杯" }],
  checklist: ["强化产品卖点"],
  replyScript: "收到,我们理解……",
};

const samples = {
  prototypes: [
    { strategy: "食欲感强化版", html: "<h1>A</h1>", solvesFeedback: "产品吸引力", risk: "偏产品感", priority: "高" },
  ],
};

test("着陆→工作台→输入→解码:展示真实数据并在第7步生成小样", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => card })
      .mockResolvedValueOnce({ ok: true, json: async () => samples }),
  );

  render(<Page />);
  await userEvent.click(screen.getByRole("button", { name: /Start Now/ }));
  await userEvent.click(screen.getByRole("button", { name: /放入客户信号/ }));
  await userEvent.click(screen.getByRole("button", { name: /开始解码/ }));

  await waitFor(() => expect(screen.getByText("中等偏强")).toBeInTheDocument());

  await userEvent.click(screen.getByRole("button", { name: /交付/ }));
  await waitFor(() => expect(screen.getByText("食欲感强化版")).toBeInTheDocument());
  expect(document.querySelector("iframe")).not.toBeNull();
});

test("analyze 失败时在输入页展示错误", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValueOnce({ ok: false, json: async () => ({ error: "炸了" }) }),
  );
  render(<Page />);
  await userEvent.click(screen.getByRole("button", { name: /Start Now/ }));
  await userEvent.click(screen.getByRole("button", { name: /放入客户信号/ }));
  await userEvent.click(screen.getByRole("button", { name: /开始解码/ }));
  await waitFor(() => expect(screen.getByText(/炸了/)).toBeInTheDocument());
});

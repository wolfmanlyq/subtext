import { test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Page from "./page";

beforeEach(() => vi.restoreAllMocks());

const card = {
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
  clientReply: "收到,我们理解……",
};

const samples = {
  prototypes: [
    { name: "食欲感强化版", strategy: "先勾食欲", sampleCopy: "白桃冰美式", highlight: "第一眼想喝", recommend: "主推方向", html: "<h1>A</h1>" },
  ],
};

test("着陆→工作台→输入→解码:展示真实数据并在第6步生成小样", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => card })
      .mockResolvedValueOnce({ ok: true, json: async () => samples }),
  );

  render(<Page />);
  await userEvent.click(screen.getByRole("button", { name: /Start Now/ }));
  await userEvent.click(screen.getByRole("button", { name: /甲方爸爸的话/ }));
  await userEvent.click(screen.getByRole("button", { name: /开始解码/ }));

  await waitFor(() => expect(screen.getByText("中高")).toBeInTheDocument());

  await userEvent.click(screen.getByRole("button", { name: /方向/ }));
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
  await userEvent.click(screen.getByRole("button", { name: /甲方爸爸的话/ }));
  await userEvent.click(screen.getByRole("button", { name: /开始解码/ }));
  await waitFor(() => expect(screen.getByText(/炸了/)).toBeInTheDocument());
});

test("attachmentsDropped 为真时,解码视图显示降级提示", async () => {
  const droppedCard = { ...card, attachmentsDropped: true };
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValueOnce({ ok: true, json: async () => droppedCard }),
  );
  render(<Page />);
  await userEvent.click(screen.getByRole("button", { name: /Start Now/ }));
  await userEvent.click(screen.getByRole("button", { name: /甲方爸爸的话/ }));
  await userEvent.click(screen.getByRole("button", { name: /开始解码/ }));
  await waitFor(() =>
    expect(screen.getByText(/附件未被模型读取/)).toBeInTheDocument(),
  );
});

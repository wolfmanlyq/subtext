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

const insight = { keyInsight: "快洞察:客户其实怕不卖货。", emotionIntensity: "中高" };

const samples = {
  prototypes: [
    { name: "食欲感强化版", strategy: "先勾食欲", sampleCopy: "白桃冰美式", highlight: "第一眼想喝", recommend: "主推方向", html: "<h1>A</h1>" },
  ],
};

/** 按 URL 分发的 fetch mock;每个 URL 给一个返回体或 Response。 */
function routeFetch(map: Record<string, unknown>) {
  return vi.fn((url: string) => {
    const key = Object.keys(map).find((k) => url.includes(k));
    const v = key ? map[key] : null;
    if (v && typeof v === "object" && "ok" in (v as object)) {
      return Promise.resolve(v as Response);
    }
    return Promise.resolve({ ok: true, json: async () => v } as unknown as Response);
  });
}

test("着陆→输入→解码:展示真实数据并在第6步生成小样", async () => {
  vi.stubGlobal("fetch", routeFetch({ "/api/insight": insight, "/api/analyze": card, "/api/prototypes": samples }));

  render(<Page />);
  await userEvent.click(screen.getByRole("button", { name: /Start Now/ }));
  await userEvent.click(screen.getByRole("button", { name: /开始解码/ }));

  await waitFor(() => expect(screen.getByText("中高")).toBeInTheDocument());

  await userEvent.click(screen.getByRole("button", { name: /方向/ }));
  await waitFor(() => expect(screen.getByText("食欲感强化版")).toBeInTheDocument());
  expect(document.querySelector("iframe")).not.toBeNull();
});

test("analyze 失败时在输入页展示错误", async () => {
  vi.stubGlobal(
    "fetch",
    routeFetch({
      "/api/insight": insight,
      "/api/analyze": { ok: false, json: async () => ({ error: "炸了" }) },
    }),
  );
  render(<Page />);
  await userEvent.click(screen.getByRole("button", { name: /Start Now/ }));
  await userEvent.click(screen.getByRole("button", { name: /开始解码/ }));
  await waitFor(() => expect(screen.getByText(/炸了/)).toBeInTheDocument());
});

test("attachmentsDropped 为真时,解码视图显示降级提示", async () => {
  const droppedCard = { ...card, attachmentsDropped: true };
  vi.stubGlobal("fetch", routeFetch({ "/api/insight": insight, "/api/analyze": droppedCard }));
  render(<Page />);
  await userEvent.click(screen.getByRole("button", { name: /Start Now/ }));
  await userEvent.click(screen.getByRole("button", { name: /开始解码/ }));
  await waitFor(() =>
    expect(screen.getByText(/附件未被模型读取/)).toBeInTheDocument(),
  );
});

test("点击解码后立即显示原话(甲方原声带),不等 analyze 返回", async () => {
  // insight/analyze 都挂起:只验证原话秒显 + 解码中
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));

  render(<Page />);
  await userEvent.click(screen.getByRole("button", { name: /Start Now/ }));
  await userEvent.click(screen.getByRole("button", { name: /开始解码/ }));

  await waitFor(() =>
    expect(document.querySelector(".quote")?.textContent ?? "").toMatch(/白桃/),
  );
  expect(screen.getByText(/解码中/)).toBeInTheDocument();
});

test("快洞察先回:Step1 言外之意先显示,完整卡尚未到达", async () => {
  let resolveAnalyze: (v: unknown) => void = () => {};
  const analyzePending = new Promise((res) => { resolveAnalyze = res; });
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url.includes("/api/insight")) {
        return Promise.resolve({ ok: true, json: async () => insight } as unknown as Response);
      }
      return analyzePending as Promise<Response>; // analyze 挂起
    }),
  );

  render(<Page />);
  await userEvent.click(screen.getByRole("button", { name: /Start Now/ }));
  await userEvent.click(screen.getByRole("button", { name: /开始解码/ }));

  // 快洞察先回:Step1 显示其 keyInsight,即使完整卡还没到
  await waitFor(() => expect(screen.getAllByText(/快洞察:客户其实怕不卖货/).length).toBeGreaterThan(0));

  resolveAnalyze({ ok: true, json: async () => card });
});

import { test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Page from "./page";

beforeEach(() => vi.restoreAllMocks());

const core = {
  needMoreInfo: false,
  realDemand: { explicit: ["卖点更明确"], implicit: ["促进到店"] },
  coreTension: [
    { left: "年轻化", right: "品牌质感", leftPercent: 65, rightPercent: 35, note: "想年轻又怕掉质感" },
  ],
  foresight: ["下一轮客户可能会问:用户为什么现在买"],
  evidence: ["客户先认可视觉好看 → 说明问题不是审美"],
  questionsToConfirm: [],
};

const delivery = {
  clientReply: "收到,我们理解……",
  checklist: ["强化产品卖点"],
  nextActions: [{ role: "设计", title: "重排层级", detail: "放大产品杯", reason: "补产品吸引力" }],
};

const insight = { keyInsight: "快洞察:客户其实怕不卖货。", emotionIntensity: "中高" };

const samples = {
  prototypes: [
    { name: "食欲感强化版", strategy: "先勾食欲", sampleCopy: "白桃冰美式", highlight: "第一眼想喝", recommend: "主推方向", html: "<h1>A</h1>" },
  ],
};

/** 按 URL 分发的 fetch mock。 */
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
  vi.stubGlobal(
    "fetch",
    routeFetch({
      "/api/insight": insight,
      "/api/decode/core": core,
      "/api/decode/delivery": delivery,
      "/api/prototypes": samples,
    }),
  );

  render(<Page />);
  await userEvent.click(screen.getByRole("button", { name: /Start Now/ }));
  await userEvent.click(screen.getByRole("button", { name: /开始解码/ }));

  await waitFor(() => expect(screen.getByText("中高")).toBeInTheDocument());

  await userEvent.click(screen.getByRole("button", { name: /方向/ }));
  await waitFor(() => expect(screen.getByText("食欲感强化版")).toBeInTheDocument());
  expect(document.querySelector("iframe")).not.toBeNull();
});

test("core 失败时在解码视图 Step2 显示错误(不退回输入页)", async () => {
  vi.stubGlobal(
    "fetch",
    routeFetch({
      "/api/insight": insight,
      "/api/decode/core": { ok: false, json: async () => ({ error: "炸了" }) },
    }),
  );
  render(<Page />);
  await userEvent.click(screen.getByRole("button", { name: /Start Now/ }));
  await userEvent.click(screen.getByRole("button", { name: /开始解码/ }));
  // 仍在解码页(原话可见),翻到 Step2 看到错误
  await waitFor(() => expect(document.querySelector(".quote")).not.toBeNull());
  await userEvent.click(screen.getByRole("button", { name: /明话/ }));
  await waitFor(() => expect(screen.getByText(/炸了/)).toBeInTheDocument());
});

test("attachmentsDropped 为真时(来自 core),Step1 显示降级提示", async () => {
  const droppedCore = { ...core, attachmentsDropped: true };
  vi.stubGlobal(
    "fetch",
    routeFetch({ "/api/insight": insight, "/api/decode/core": droppedCore, "/api/decode/delivery": delivery }),
  );
  render(<Page />);
  await userEvent.click(screen.getByRole("button", { name: /Start Now/ }));
  await userEvent.click(screen.getByRole("button", { name: /开始解码/ }));
  await waitFor(() => expect(screen.getByText(/附件未被模型读取/)).toBeInTheDocument());
});

test("点击解码后立即显示原话,不等任何调用返回", async () => {
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
  render(<Page />);
  await userEvent.click(screen.getByRole("button", { name: /Start Now/ }));
  await userEvent.click(screen.getByRole("button", { name: /开始解码/ }));
  await waitFor(() =>
    expect(document.querySelector(".quote")?.textContent ?? "").toMatch(/白桃/),
  );
  expect(screen.getByText(/解码中/)).toBeInTheDocument();
});

test("快洞察先回:Step1 言外之意先显示,core 尚未到达", async () => {
  let resolveCore: (v: unknown) => void = () => {};
  const corePending = new Promise((res) => { resolveCore = res; });
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url.includes("/api/insight")) {
        return Promise.resolve({ ok: true, json: async () => insight } as unknown as Response);
      }
      return corePending as Promise<Response>; // core 挂起
    }),
  );

  render(<Page />);
  await userEvent.click(screen.getByRole("button", { name: /Start Now/ }));
  await userEvent.click(screen.getByRole("button", { name: /开始解码/ }));

  await waitFor(() => expect(screen.getAllByText(/快洞察:客户其实怕不卖货/).length).toBeGreaterThan(0));

  resolveCore({ ok: true, json: async () => core });
});

test("core 已到但 delivery 挂起:Step6 显示解码中", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url.includes("/api/insight")) return Promise.resolve({ ok: true, json: async () => insight } as unknown as Response);
      if (url.includes("/api/decode/core")) return Promise.resolve({ ok: true, json: async () => core } as unknown as Response);
      return new Promise(() => {}); // delivery / prototypes 挂起
    }),
  );
  render(<Page />);
  await userEvent.click(screen.getByRole("button", { name: /Start Now/ }));
  await userEvent.click(screen.getByRole("button", { name: /开始解码/ }));
  // 等 core 已到:Step1 洞察强度渲染出来,确认 insight 已就绪
  await waitFor(() => expect(screen.getByText("中高")).toBeInTheDocument());
  // 翻到 Step6
  await userEvent.click(screen.getByRole("button", { name: /方向/ }));
  // delivery 挂起 → 客户回复话术不可见,但"解码中"提示可见
  expect(screen.queryByText("客户回复话术")).toBeNull();
  await waitFor(() => expect(screen.getByText(/解码中/)).toBeInTheDocument());
});

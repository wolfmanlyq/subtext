import { test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ActionCard } from "./ActionCard";
import type { ActionCard as Card } from "@/lib/schema";

const card: Card = {
  needMoreInfo: false,
  oneLineTranslation: "好看但不卖货",
  explicitNeeds: ["卖点更明确"],
  implicitNeeds: ["促进到店"],
  coreConflict: "年轻化 vs 质感",
  feedbackTypes: ["产品卖点"],
  items: [{ desc: "放大产品杯", priority: "必须修改", roles: ["设计"], risk: "削弱氛围" }],
  questionsToAsk: ["海报还是短视频?"],
  replyScript: "收到,我们理解……",
};

test("渲染一句话翻译与修改项", () => {
  render(<ActionCard card={card} />);
  expect(screen.getByText("好看但不卖货")).toBeInTheDocument();
  expect(screen.getByText("放大产品杯")).toBeInTheDocument();
  expect(screen.getByText(/必须修改/)).toBeInTheDocument();
});

test("needMoreInfo 时展示追问区", () => {
  render(<ActionCard card={{ ...card, needMoreInfo: true }} />);
  expect(screen.getByText(/需要补充信息/)).toBeInTheDocument();
  expect(screen.getByText("海报还是短视频?")).toBeInTheDocument();
});

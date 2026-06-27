import { test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PrototypeGallery } from "./PrototypeGallery";
import type { Prototype } from "@/lib/prototype";

const protos: Prototype[] = [
  { strategy: "食欲感强化版", html: "<h1>A</h1>", solvesFeedback: "产品吸引力", risk: "偏产品感", priority: "高" },
  { strategy: "活动利益强化版", html: "<h1>B</h1>", solvesFeedback: "购买理由", risk: "显廉价", priority: "中" },
];

test("每个方向渲染一个 sandbox iframe,srcDoc 含 html", () => {
  render(<PrototypeGallery prototypes={protos} />);
  const iframes = document.querySelectorAll("iframe");
  expect(iframes.length).toBe(2);
  expect(iframes[0].getAttribute("sandbox")).not.toBeNull();
  expect(iframes[0].getAttribute("srcdoc")).toContain("<h1>A</h1>");
});

test("选择某方向后展示 AI 反推偏好判断", async () => {
  const { container } = render(<PrototypeGallery prototypes={protos} />);
  await userEvent.click(screen.getAllByRole("button", { name: /选这个方向/ })[1]);
  const judge = container.querySelector(".sample-judgement");
  expect(judge).not.toBeNull();
  expect(judge?.textContent).toContain("活动利益强化版");
  expect(judge?.textContent).toContain("购买理由");
});

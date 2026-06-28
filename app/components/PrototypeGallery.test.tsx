import { test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PrototypeGallery } from "./PrototypeGallery";
import type { Prototype } from "@/lib/prototype";

const protos: Prototype[] = [
  { name: "食欲感强化版", strategy: "先勾食欲", sampleCopy: "白桃冰美式", highlight: "第一眼想喝", recommend: "主推方向", html: "<h1>A</h1>" },
  { name: "活动利益强化版", strategy: "把促销变尝鲜理由", sampleCopy: "第二杯半价", highlight: "现在买刚好", recommend: "优先给客户看", html: "<h1>B</h1>" },
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
  expect(judge?.textContent).toContain("活动利益强化版");
});

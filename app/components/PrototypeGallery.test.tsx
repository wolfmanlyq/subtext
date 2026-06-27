import { test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PrototypeGallery } from "./PrototypeGallery";
import type { Prototype } from "@/lib/prototype";

const protos: Prototype[] = [
  { strategy: "强化卖点", html: "<h1>A</h1>", solvesFeedback: "卖点", risk: "无", priority: "高" },
  { strategy: "创意升级", html: "<h1>B</h1>", solvesFeedback: "传播", risk: "成本", priority: "中" },
];

test("渲染每个方向的策略与一个 iframe", () => {
  render(<PrototypeGallery prototypes={protos} />);
  expect(screen.getByText("强化卖点")).toBeInTheDocument();
  expect(screen.getByText("创意升级")).toBeInTheDocument();
  expect(document.querySelectorAll("iframe").length).toBe(2);
});

test("iframe 带 sandbox 且 srcDoc 含 html", () => {
  render(<PrototypeGallery prototypes={protos} />);
  const iframe = document.querySelector("iframe")!;
  expect(iframe.getAttribute("sandbox")).not.toBeNull();
  expect(iframe.getAttribute("srcdoc")).toContain("<h1>A</h1>");
});

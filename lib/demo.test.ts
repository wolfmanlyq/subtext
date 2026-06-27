import { test, expect } from "vitest";
import { DEMO_INPUT } from "./demo";

test("示例输入包含白桃关键词与四个标签", () => {
  expect(DEMO_INPUT.feedback).toContain("白桃");
  expect(DEMO_INPUT.projectType).toBeTruthy();
  expect(DEMO_INPUT.stage).toBeTruthy();
  expect(DEMO_INPUT.audience).toBeTruthy();
  expect(DEMO_INPUT.clientStyle).toBeTruthy();
});

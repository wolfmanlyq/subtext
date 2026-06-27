import { test, expect } from "vitest";
import { buildAnalyzePrompt, buildPrototypePrompt } from "./prompts";
import type { AnalyzeInput } from "./demo";

const input: AnalyzeInput = {
  feedback: "再高级一点,但别太硬广",
  projectType: "品牌海报",
  stage: "初稿反馈",
  audience: "设计",
  clientStyle: "保守",
};

test("buildAnalyzePrompt 含 system、要求 JSON 输出、拼入用户输入", () => {
  const { system, user } = buildAnalyzePrompt(input);
  expect(system).toMatch(/广告/);
  expect(system).toMatch(/JSON/);
  expect(system).toContain("agentJudgment");
  expect(system).toContain("roleActions");
  expect(user).toContain("再高级一点");
  expect(user).toContain("品牌海报");
});

test("buildPrototypePrompt 要求自包含 HTML 且并入需求摘要", () => {
  const { system, user } = buildPrototypePrompt("客户要更想喝", "原始反馈文本");
  expect(system).toMatch(/HTML/);
  expect(system).toMatch(/内联|inline|自包含/);
  expect(user).toContain("客户要更想喝");
  expect(user).toContain("原始反馈文本");
});

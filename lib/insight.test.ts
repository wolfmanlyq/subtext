import { test, expect } from "vitest";
import { InsightSchema } from "./insight";

test("接受合法 insight", () => {
  const ok = { keyInsight: "客户不是X,而是Y", emotionIntensity: "中高" };
  expect(InsightSchema.parse(ok).keyInsight).toContain("不是X");
});

test("缺字段被拒绝", () => {
  expect(InsightSchema.safeParse({ keyInsight: "x" }).success).toBe(false);
  expect(InsightSchema.safeParse({ emotionIntensity: "中高" }).success).toBe(false);
});

test("字段类型错被拒绝", () => {
  expect(InsightSchema.safeParse({ keyInsight: 1, emotionIntensity: "中" }).success).toBe(false);
});

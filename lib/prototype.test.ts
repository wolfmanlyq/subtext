import { test, expect } from "vitest";
import { PrototypeSchema, PrototypesSchema } from "./prototype";

test("PrototypeSchema 校验六个字符串字段", () => {
  const ok = { name: "A", strategy: "s", sampleCopy: "c", highlight: "h", recommend: "r", html: "<h1>x</h1>" };
  expect(PrototypeSchema.parse(ok).name).toBe("A");
  expect(PrototypeSchema.safeParse({ ...ok, html: 1 }).success).toBe(false);
});

test("PrototypesSchema 包一层 prototypes 数组", () => {
  const ok = { prototypes: [{ name: "A", strategy: "s", sampleCopy: "c", highlight: "h", recommend: "r", html: "<x/>" }] };
  expect(PrototypesSchema.parse(ok).prototypes).toHaveLength(1);
});

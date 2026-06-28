import { test, expect } from "vitest";
import { CoreSchema, DeliverySchema } from "./schema";

test("CoreSchema 校验 B 组字段,缺字段失败", () => {
  const ok = {
    needMoreInfo: false,
    realDemand: { explicit: ["a"], implicit: ["b"] },
    coreTension: [{ left: "年轻", right: "质感", leftPercent: 60, rightPercent: 40, note: "n" }],
    foresight: ["f"],
    evidence: ["e"],
    questionsToConfirm: [],
  };
  expect(CoreSchema.parse(ok).needMoreInfo).toBe(false);
  expect(CoreSchema.safeParse({ ...ok, realDemand: undefined }).success).toBe(false);
});

test("DeliverySchema 校验 C 组字段", () => {
  const ok = {
    clientReply: "收到",
    checklist: ["强化卖点"],
    nextActions: [{ role: "设计", title: "重排", detail: "放大", reason: "补吸引力" }],
  };
  expect(DeliverySchema.parse(ok).clientReply).toBe("收到");
  expect(DeliverySchema.safeParse({ ...ok, clientReply: 123 }).success).toBe(false);
});

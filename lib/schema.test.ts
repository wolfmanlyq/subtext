import { test, expect } from "vitest";
import { ActionCardSchema } from "./schema";

const valid = {
  needMoreInfo: false,
  emotionIntensity: "中高",
  keyInsight: "客户不是觉得画面不好看,而是担心广告好看但不卖货。",
  realDemand: {
    explicit: ["产品本身要更有想喝的感觉"],
    implicit: ["客户希望下一版能解释用户为什么现在要买"],
  },
  coreTension: [
    { left: "年轻化", right: "品牌质感", leftPercent: 65, rightPercent: 35, note: "想要年轻化但不想牺牲品牌安全感。" },
  ],
  foresight: ["客户可能会继续问:用户为什么现在要买?"],
  evidence: ["客户先认可视觉好看 → 说明问题不是单纯审美"],
  questionsToConfirm: ["这次更想优先强化想喝感还是活动利益?"],
  nextActions: [
    { role: "设计", title: "重排视觉层级", detail: "放大产品杯与水珠", reason: "客户已认可氛围,要补的是产品吸引力" },
  ],
  checklist: ["把第二杯半价从角落移到主视觉利益点标签"],
  clientReply: "收到,我们理解……",
};

test("ActionCardSchema 接受完整原型3结构", () => {
  const parsed = ActionCardSchema.parse(valid);
  expect(parsed.keyInsight).toContain("不卖货");
  expect(parsed.realDemand.explicit).toHaveLength(1);
  expect(parsed.coreTension[0].leftPercent).toBe(65);
  expect(parsed.nextActions[0].role).toBe("设计");
});

test("coreTension 百分比缺失被拒绝", () => {
  const bad = {
    ...valid,
    coreTension: [{ left: "A", right: "B", note: "x" }],
  };
  expect(ActionCardSchema.safeParse(bad).success).toBe(false);
});

test("needMoreInfo=true 时其余可为空", () => {
  const partial = {
    needMoreInfo: true,
    emotionIntensity: "",
    keyInsight: "",
    realDemand: { explicit: [], implicit: [] },
    coreTension: [],
    foresight: [],
    evidence: [],
    questionsToConfirm: ["请提供上一版方案摘要"],
    nextActions: [],
    checklist: [],
    clientReply: "",
  };
  expect(ActionCardSchema.parse(partial).needMoreInfo).toBe(true);
});

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

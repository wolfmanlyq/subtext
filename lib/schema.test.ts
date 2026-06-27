import { test, expect } from "vitest";
import { ActionCardSchema } from "./schema";

const valid = {
  needMoreInfo: false,
  emotionIntensity: "中等偏强",
  agentJudgment: "复合修改,不是单点意见",
  feedbackTypes: ["产品卖点", "活动信息", "调性"],
  explicitNeeds: ["产品要更有想喝的感觉"],
  implicitNeeds: ["希望促进到店购买"],
  conflicts: [{ left: "想要年轻化", right: "不能太网红" }],
  risks: ["只加强活动信息可能变成廉价促销海报"],
  evidence: ["客户先认可视觉好看,说明问题不是单纯审美"],
  questionsToAsk: ["“年轻一点”指视觉还是文案?"],
  roleActions: [{ role: "设计", title: "重排层级", desc: "放大产品杯与水珠" }],
  checklist: ["强化产品口感卖点"],
  replyScript: "收到,我们理解……",
};

test("ActionCardSchema 接受完整 7 步字段对象", () => {
  const parsed = ActionCardSchema.parse(valid);
  expect(parsed.conflicts[0].left).toBe("想要年轻化");
  expect(parsed.roleActions[0].role).toBe("设计");
  expect(parsed.checklist).toHaveLength(1);
});

test("缺字段被拒绝", () => {
  const { conflicts, ...missing } = valid;
  void conflicts;
  expect(ActionCardSchema.safeParse(missing).success).toBe(false);
});

test("needMoreInfo=true 时其余可为空数组/空串", () => {
  const partial = {
    needMoreInfo: true,
    emotionIntensity: "",
    agentJudgment: "",
    feedbackTypes: [],
    explicitNeeds: [],
    implicitNeeds: [],
    conflicts: [],
    risks: [],
    evidence: [],
    questionsToAsk: ["请提供上一版方案摘要"],
    roleActions: [],
    checklist: [],
    replyScript: "",
  };
  expect(ActionCardSchema.parse(partial).needMoreInfo).toBe(true);
});

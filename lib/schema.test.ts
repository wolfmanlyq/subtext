import { test, expect } from "vitest";
import { ActionCardSchema, PriorityEnum } from "./schema";

test("ActionCardSchema 接受完整合法对象", () => {
  const valid = {
    needMoreInfo: false,
    oneLineTranslation: "客户担心广告好看但不卖货",
    explicitNeeds: ["产品要更有想喝的感觉"],
    implicitNeeds: ["希望促进到店购买"],
    coreConflict: "年轻化 vs 品牌质感",
    feedbackTypes: ["产品卖点", "视觉调性"],
    items: [
      { desc: "放大产品杯", priority: "必须修改", roles: ["设计"], risk: "可能削弱氛围" },
    ],
    questionsToAsk: ["是海报还是短视频?"],
    replyScript: "收到,我们理解您的诉求……",
  };
  const parsed = ActionCardSchema.parse(valid);
  expect(parsed.items[0].priority).toBe("必须修改");
});

test("priority 非法值被拒绝", () => {
  expect(PriorityEnum.safeParse("随便改").success).toBe(false);
});

test("needMoreInfo=true 时其余字段可为空数组/空串", () => {
  const partial = {
    needMoreInfo: true,
    oneLineTranslation: "",
    explicitNeeds: [],
    implicitNeeds: [],
    coreConflict: "",
    feedbackTypes: [],
    items: [],
    questionsToAsk: ["请提供上一版方案摘要"],
    replyScript: "",
  };
  expect(ActionCardSchema.parse(partial).needMoreInfo).toBe(true);
});

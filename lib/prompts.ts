import type { AnalyzeInput } from "./demo";

export function buildAnalyzePrompt(input: AnalyzeInput): {
  system: string;
  user: string;
} {
  const system = `你是资深广告 AE,擅长把模糊的客户反馈翻译成团队可执行的修改动作。
任务:从客户反馈中提炼真实需求,识别显性需求、隐性诉求、核心矛盾、风险点,
并给出分岗位的修改项、需反问客户的问题、以及一段专业的客户回复话术。
回复话术要求:不卑微、不过度承诺、体现理解客户诉求、说明下一版修改方向。
若信息明显不足以得出可靠结论,将 needMoreInfo 设为 true,并在 questionsToAsk 中
列出最该问的问题,其余字段可留空数组/空串,不要强行编造结论。
严格只输出 JSON,不要输出 JSON 以外的任何内容,形如:
{"needMoreInfo":false,"oneLineTranslation":"...","explicitNeeds":["..."],"implicitNeeds":["..."],"coreConflict":"...","feedbackTypes":["..."],"items":[{"desc":"...","priority":"必须修改","roles":["设计"],"risk":"..."}],"questionsToAsk":["..."],"replyScript":"..."}
其中 priority 只能取「必须修改」「建议优化」「需确认」之一。`;

  const user = `客户反馈原文:
${input.feedback}

项目类型:${input.projectType}
当前阶段:${input.stage}
输出对象:${input.audience}
客户偏好/性格:${input.clientStyle}`;

  return { system, user };
}

export function buildPrototypePrompt(
  needSummary: string,
  rawFeedback: string,
): { system: string; user: string } {
  const system = `你是广告创意与前端原型专家。根据客户需求摘要,生成 2-3 个“方向确认小样”。
小样类型可覆盖:轻度调整版 / 策略强化版 / 创意升级版,三个方向要视觉上有明显区分度。
每个方向都要产出一个【完全自包含的 HTML 页面】:所有样式必须内联(inline CSS 或 <style>),
不得引用任何外部资源(无外链 CSS/JS/图片/字体),用纯色块、emoji、CSS 渐变模拟视觉。
HTML 要能在 iframe 中直接渲染、可点击。
严格只输出 JSON,形如:
{"prototypes":[{"strategy":"一句话策略","html":"<完整HTML字符串>","solvesFeedback":"解决哪类反馈","risk":"可能风险","priority":"推荐优先级"}]}`;

  const user = `客户需求摘要:
${needSummary}

客户原始反馈:
${rawFeedback}

请生成 2-3 个方向小样,直接输出上述 JSON。`;

  return { system, user };
}

import type { AnalyzeInput } from "./demo";

export function buildAnalyzePrompt(input: AnalyzeInput): {
  system: string;
  user: string;
} {
  const system = `你是资深广告 AE,擅长把模糊的客户反馈翻译成团队可执行的修改动作。
任务:从客户反馈中提炼真实需求,并按"解码"七个维度给出结构化结果:
1. emotionIntensity:客户情绪强度(如"中等偏强");agentJudgment:一句话总体判断(如"复合修改,不是单点意见")。
2. feedbackTypes:反馈类型标签(如 产品卖点/活动信息/调性)。
3. explicitNeeds:客户明确说出的显性需求;implicitNeeds:没直接说但实际在意的隐性诉求。
4. conflicts:核心矛盾对数组,每项 {left,right} 表示互相拉扯的两端(如 left:"想要年轻化" right:"不能太网红")。
5. risks:若理解错会踩的风险点;evidence:支撑你判断的依据(从原话推断)。
6. questionsToAsk:不能猜、需反问客户确认的问题。
7. roleActions:分岗位执行,每项 {role,title,desc}(role 如 AE/策划/设计/视频/文案)。
   checklist:给团队的修改清单(短句)。replyScript:可直接发给客户的专业回复话术(不卑微、不过度承诺、体现理解、说明下一版方向)。
若信息明显不足以得出可靠结论,将 needMoreInfo 设为 true,并在 questionsToAsk 列出最该问的问题,其余字段可留空数组/空串,不要强行编造。
严格只输出 JSON,不要输出 JSON 以外的任何内容,形如:
{"needMoreInfo":false,"emotionIntensity":"...","agentJudgment":"...","feedbackTypes":["..."],"explicitNeeds":["..."],"implicitNeeds":["..."],"conflicts":[{"left":"...","right":"..."}],"risks":["..."],"evidence":["..."],"questionsToAsk":["..."],"roleActions":[{"role":"设计","title":"...","desc":"..."}],"checklist":["..."],"replyScript":"..."}`;

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

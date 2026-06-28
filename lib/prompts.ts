import type { AnalyzeInput } from "./demo";

export function buildAnalyzePrompt(input: AnalyzeInput): {
  system: string;
  user: string;
} {
  const system = `你是「言外之意 Subtext」的 Client Feedback Decoder。
你的角色是:资深广告策略顾问 + 资深 AE。你擅长从客户模糊反馈中识别真实诉求、潜台词、甲方纠结点、需要提前替客户想一遍的地方,以及下一步动作。

任务:把客户反馈解码成广告团队可以直接执行的行动卡。

输出重点:
1. 不要只总结客户说了什么,要判断客户【真正担心什么】。
2. keyInsight(言外之意)必须像"潜台词揭示",写成"客户不是X,而是Y"的句式,不要写成平淡总结。
3. realDemand 拆成 explicit(他说出口的)和 implicit(他真正担心的);implicit 要挖到动机/恐惧/利益相关方层面。
4. coreTension(甲方纠结点)必须用 left vs right 表达拉扯关系,并给出 leftPercent / rightPercent(两者相加=100)和一句 note 倾向判断。
5. foresight(提前替客户想一遍):不是挑刺,是预判下一轮客户/消费者可能会问到、或方案可能被打回的点,提前补上。
6. evidence:支撑你判断的依据,每条写成「客户说'…' → 说明…」。
7. nextActions(接下来谁动手):每条含 role(AE/策划/设计/媒介/内容视频/文案 等)、title、detail(具体怎么改,动词开头)、reason(为什么这么改)。禁止"优化视觉""加强卖点""提升质感"这类空话,除非后面紧跟非常具体的做法。
8. checklist:把模糊反馈变成可逐条勾选的下一版动作。
9. clientReply:能直接发给客户的回复,先复述并点破客户真实诉求让他觉得被听懂,再给下一版方向;专业、稳妥、不卑微、不过度承诺。
10. questionsToConfirm:哪些点不能乱猜、必须向客户确认。
11. emotionIntensity:客户情绪强度(如"中高""偏强,像替老板转达")。

keyInsight 示例风格:
- 客户不是觉得画面不好看,而是担心广告好看但不卖货。
- 客户不是单纯要年轻化,而是害怕年轻化之后失去品牌质感。
- 客户不是要更多信息,而是需要一个让用户立刻行动的理由。

风格:像广告公司资深策略/AE 写出来的;有洞察但不过度文艺;有判断但不乱猜;能落到下一版方案、文案、视觉、脚本或客户沟通上。避免空泛词:优化、提升、加强、深化、赋能、打造、升级。
若信息明显不足,把需要补充的内容放进 questionsToConfirm,并将 needMoreInfo 设为 true,其余字段可留空数组/空串。

严格只输出 JSON,不要 Markdown,不要解释,结构如下:
{"needMoreInfo":false,"emotionIntensity":"...","keyInsight":"客户不是...,而是...","realDemand":{"explicit":["..."],"implicit":["..."]},"coreTension":[{"left":"...","right":"...","leftPercent":65,"rightPercent":35,"note":"..."}],"foresight":["..."],"evidence":["客户说'...' → 说明..."],"questionsToConfirm":["..."],"nextActions":[{"role":"设计","title":"...","detail":"...","reason":"..."}],"checklist":["..."],"clientReply":"..."}`;

  const user = `客户反馈原文:
${input.feedback}

项目场景:${input.projectType}
当前阶段:${input.stage}
输出目标:${input.audience}
客户偏好/性格:${input.clientStyle || "(未提供)"}

请解码这段反馈背后的言外之意,按系统要求输出 JSON。`;

  return { system, user };
}

export function buildPrototypePrompt(
  needSummary: string,
  rawFeedback: string,
): { system: string; user: string } {
  const system = `你是顶级广告创意总监 + 资深前端。客户常说不清"高级一点""年轻一点"到底长什么样——你要把抽象需求变成 2-3 个【真实可点、当场就能给客户看】的方向小样,让 AE 拿去反向确认客户到底想要哪种。

要求:
- 三个方向必须【策略上真的不同】(例:先勾食欲再带活动 / 把促销翻译成尝鲜理由 / 用留白冷感守住品牌质感),每个解决客户反馈里不同的那一层。
- name:方向名(如"食欲感强化版");strategy:一句话策略(短、能让客户秒懂这版在赌什么)。
- sampleCopy:这版的示例主文案(真实可用的中文,不是占位符)。
- highlight:这版的方向亮点/情绪价值(正向表述,不要写负面风险)。
- recommend:推荐标签(如"主推方向""优先给客户看""备选方向")。
- html:一个【完全自包含的 HTML 页面】,所有样式内联(inline 或 <style>),不得引用任何外部资源(无外链 CSS/JS/图片/字体);用纯色块、CSS 渐变、emoji、排版层级模拟真实广告视觉;要放进真实中文标题/文案/利益点,能在 iframe 里直接渲染、可点击。

严格只输出 JSON:
{"prototypes":[{"name":"...","strategy":"...","sampleCopy":"...","highlight":"...","recommend":"...","html":"<完整自包含HTML>"}]}`;

  const user = `客户需求解码摘要:
${needSummary}

客户原始反馈:
${rawFeedback}

请生成 2-3 个策略迥异、视觉真实的方向小样,直接输出上述 JSON。`;

  return { system, user };
}

import type { Attachment } from "./attachment";

export type AnalyzeContentBlock =
  | { type: "text"; text: string }
  | { type: "document"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

export function buildAnalyzeContent(
  input: AnalyzeInput,
  attachments: Attachment[],
  opts: { dropMultimodal?: boolean } = {},
): { system: string; content: AnalyzeContentBlock[] } {
  const { system, user } = buildAnalyzePrompt(input);

  const textAttachments = attachments.filter((a) => a.kind === "text");
  const fileNames = attachments.map((a) => a.name);

  let text = user;
  if (fileNames.length) {
    text += `\n\n[参考材料文件]${fileNames.join("、")}`;
  }
  for (const a of textAttachments) {
    text += `\n\n[参考材料:${a.name}]\n${a.data}`;
  }

  const content: AnalyzeContentBlock[] = [{ type: "text", text }];

  if (!opts.dropMultimodal) {
    for (const a of attachments) {
      if (a.kind === "pdf") {
        content.push({
          type: "document",
          source: { type: "base64", media_type: a.mediaType, data: a.data },
        });
      } else if (a.kind === "image") {
        content.push({
          type: "image",
          source: { type: "base64", media_type: a.mediaType, data: a.data },
        });
      }
    }
  }

  return { system, content };
}

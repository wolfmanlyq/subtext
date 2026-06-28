import type { AnalyzeInput } from "./demo";
import type { Attachment } from "./attachment";
import type { Core } from "./schema";

export function contextLines(input: AnalyzeInput): string {
  const rows: string[] = [];
  if (input.industry?.trim()) rows.push(`行业类型:${input.industry.trim()}`);
  if (input.brandName?.trim()) rows.push(`品牌名称:${input.brandName.trim()}`);
  if (input.clientRole?.trim()) rows.push(`客户角色:${input.clientRole.trim()}`);
  return rows.length ? `\n\n${rows.join("\n")}` : "";
}

const CONTEXT_RULES = `
背景字段使用规则(均可为空,不能因为没填就拒绝输出):
- 行业类型:影响常见卖点、表达方式与周全性检查点。
- 品牌名称:有则让给客户的回复和方向小样话术更具体;没有则绝不编造品牌。
- 客户角色:用于判断真实关注点(品牌经理重调性/品牌安全感;产品负责人重卖点/说服力;老板重结果/确定性/少返工;市场部重传播效率;代理商重对上沟通;不确定则两条线并行)。`;


export function buildCorePrompt(input: AnalyzeInput): { system: string; user: string } {
  const system = `你是「言外之意 Subtext」的 Client Feedback Decoder。
你的角色是:资深广告策略顾问 + 资深 AE。你擅长从客户模糊反馈中识别真实诉求、潜台词、甲方纠结点、需要提前替客户想一遍的地方。

任务:把客户反馈解码成"理解客户"这一层的结构化分析(不含给客户的回复话术和分工)。

输出重点:
1. 不要只总结客户说了什么,要判断客户【真正担心什么】。
2. realDemand 拆成 explicit(他说出口的)和 implicit(他真正担心的);implicit 要挖到动机/恐惧/利益相关方层面。
3. coreTension(甲方纠结点)必须用 left vs right 表达拉扯关系,并给出 leftPercent / rightPercent(两者相加=100)和一句 note 倾向判断。
4. foresight(提前替客户想一遍):预判下一轮客户/消费者可能会问到、或方案可能被打回的点,提前补上。
5. evidence:支撑你判断的依据,每条写成「客户说'…' → 说明…」。
6. questionsToConfirm:哪些点不能乱猜、必须向客户确认。
7. needMoreInfo:若信息明显不足,设为 true,并把要补充的放进 questionsToConfirm,其余字段可留空数组。

风格:像广告公司资深策略/AE;有洞察但不过度文艺;有判断但不乱猜。避免空泛词:优化、提升、加强、深化、赋能、打造、升级。

${CONTEXT_RULES}

严格只输出 JSON,不要 Markdown,不要解释,结构如下:
{"needMoreInfo":false,"realDemand":{"explicit":["..."],"implicit":["..."]},"coreTension":[{"left":"...","right":"...","leftPercent":65,"rightPercent":35,"note":"..."}],"foresight":["..."],"evidence":["客户说'...' → 说明..."],"questionsToConfirm":["..."]}`;

  const user = `客户反馈原文:
${input.feedback}

项目场景:${input.projectType}
当前阶段:${input.stage}
输出目标:${input.audience}
客户偏好/性格:${input.clientStyle || "(未提供)"}${contextLines(input)}

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

export type AnalyzeContentBlock =
  | { type: "text"; text: string }
  | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } }
  | {
      type: "image";
      source: {
        type: "base64";
        media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
        data: string;
      };
    };

export function buildCoreContent(
  input: AnalyzeInput,
  attachments: Attachment[],
  opts: { dropMultimodal?: boolean } = {},
): { system: string; content: AnalyzeContentBlock[] } {
  const { system, user } = buildCorePrompt(input);

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
          source: { type: "base64", media_type: "application/pdf" as const, data: a.data },
        });
      } else if (a.kind === "image") {
        content.push({
          type: "image",
          source: {
            type: "base64",
            media_type: a.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
            data: a.data,
          },
        });
      }
    }
  }

  return { system, content };
}

export function buildInsightPrompt(input: AnalyzeInput): { system: string; user: string } {
  const system = `你是资深广告策略顾问。只做一件事:用最快速度点破这条客户反馈的【言外之意】。

输出两项:
- keyInsight:言外之意一句话,写成"客户不是X,而是Y"的潜台词揭示句式,犀利、抓痛点,不要平淡总结。
- emotionIntensity:客户情绪强度(如"中高""偏强,像替老板转达")。

${CONTEXT_RULES}

严格只输出 JSON,不要 Markdown,不要解释:
{"keyInsight":"客户不是...,而是...","emotionIntensity":"..."}`;

  const user = `客户反馈原文:
${input.feedback}

项目场景:${input.projectType}
当前阶段:${input.stage}${contextLines(input)}

请只输出上述两项 JSON。`;

  return { system, user };
}

export function buildDeliveryPrompt(input: AnalyzeInput, core: Core): { system: string; user: string } {
  const system = `你是「言外之意 Subtext」的资深 AE。已有对客户反馈的分析结论,你只负责把它落成【交付物】:给客户的回复话术、可勾选的修改清单、谁动手。

输出重点:
1. clientReply:能直接发给客户的回复,先复述并点破客户真实诉求让他觉得被听懂,再给下一版方向;专业、稳妥、不卑微、不过度承诺。
2. checklist:把模糊反馈变成可逐条勾选的下一版动作。
3. nextActions(接下来谁动手):每条含 role(AE/策划/设计/媒介/内容视频/文案 等)、title、detail(具体怎么改,动词开头)、reason(为什么这么改)。禁止"优化视觉""加强卖点""提升质感"这类空话,除非后面紧跟非常具体的做法。

避免空泛词:优化、提升、加强、深化、赋能、打造、升级。

${CONTEXT_RULES}

严格只输出 JSON,不要 Markdown,不要解释,结构如下:
{"clientReply":"...","checklist":["..."],"nextActions":[{"role":"设计","title":"...","detail":"...","reason":"..."}]}`;

  const tensionText = core.coreTension.map((t) => `${t.left} vs ${t.right}(${t.note})`).join(";");
  const user = `客户反馈原文:
${input.feedback}

项目场景:${input.projectType}
当前阶段:${input.stage}
输出目标:${input.audience}${contextLines(input)}

【已完成的分析结论】
他说出口的:${core.realDemand.explicit.join("、") || "(无)"}
他真正担心的:${core.realDemand.implicit.join("、") || "(无)"}
甲方纠结点:${tensionText || "(无)"}
需要确认的点:${core.questionsToConfirm.join("、") || "(无)"}

请基于以上分析,生成交付物 JSON。`;

  return { system, user };
}

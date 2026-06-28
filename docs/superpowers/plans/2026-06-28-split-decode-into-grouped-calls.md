# 解码分组并行加载 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把单个 `/api/analyze` 整卡调用拆成分组并行调用,让解码各步随对应组返回逐步点亮。

**Architecture:** 三组调用——A 快洞察 `/api/insight`(已存在,不动)→ Step1;B 分析主体 `/api/decode/core`(新)→ Step2-5;C 交付 `/api/decode/delivery`(新)→ Step6-7。点击解码后原话秒显、A+B 并发,B 返回后发起 C(C 的 prompt 带上 B 的分析结果)。删除 `/api/analyze`。每组独立 loading/error,不再一处失败整体退回输入页。

**Tech Stack:** Next.js 16 App Router (TS) / React 19 / `@anthropic-ai/sdk` core Messages API / Zod / Vitest + @testing-library/react。

## Global Constraints

- 继续使用中转端点 `https://api.openai-next.com`,不切官方端点;部署/wrangler 配置不动。
- 模型常量 `MODEL`(`claude-opus-4-8`),通过 `getClient().messages.create` 调用;输出靠 prompt 指定 JSON + `extractJson` + Zod 校验。
- 所有路由沿用既有模式:`class BadModelOutput extends Error {}`;坏输出解析失败 → 重试一次;两次都坏 → 友好错误(不暴露 Zod 原文);连接错(SDK 抛错)不重试。
- 多模态附件:沿用 `buildAnalyzeContent` 的降级逻辑(去掉多模态块重试 + 响应标 `attachmentsDropped: true`)。附件只喂给 B 组。
- 测试命令:`npm test`(内部 `mkdir -p .vitest-tmp && TMPDIR="$PWD/.vitest-tmp" vitest run`)。运行单个文件:`npm test -- <path>`。
- 类型检查:`npx tsc --noEmit`(需 `TMPDIR="$PWD/.vitest-tmp"` 前缀避免沙箱 EACCES)。
- git 账号:`git -c user.email=wolfmanlyq@hotmail.com commit`。
- `AnalyzeInput` = `{ feedback, projectType, stage, audience, clientStyle }`(均 string)。

---

## 文件结构

| 文件 | 职责 | 动作 |
|---|---|---|
| `lib/schema.ts` | 新增 `CoreSchema`/`Core`、`DeliverySchema`/`Delivery`;保留 `ActionCardSchema` 等 | Modify |
| `lib/prompts.ts` | 新增 `buildCorePrompt`/`buildCoreContent`/`buildDeliveryPrompt`;删除 `buildAnalyzePrompt`/`buildAnalyzeContent` | Modify |
| `app/api/decode/core/route.ts` | B 组路由(附件+降级+重试) | Create |
| `app/api/decode/delivery/route.ts` | C 组路由(接收 core,重试) | Create |
| `app/api/analyze/route.ts` + `.test.ts` | 删除 | Delete |
| `app/page.tsx` | 分组状态 + 编排(A+B 并发,B 后发 C) | Modify |
| `app/components/DecodeView.tsx` | prop 改为 insight/core/delivery + 各组 loading/error | Modify |
| `app/page.test.tsx` | mock 改为 core/delivery,新增分组用例 | Modify |
| `lib/prompts.test.ts` | 改测新 prompt 函数 | Modify |

---

## Task 1: schema 拆分(CoreSchema / DeliverySchema)

**Files:**
- Modify: `lib/schema.ts`
- Test: `lib/schema.test.ts`

**Interfaces:**
- Consumes: 已有 `RealDemandSchema`, `TensionSchema`, `NextActionSchema`
- Produces:
  - `CoreSchema` (zod) / `type Core = { needMoreInfo: boolean; realDemand: RealDemand; coreTension: Tension[]; foresight: string[]; evidence: string[]; questionsToConfirm: string[] }`
  - `DeliverySchema` (zod) / `type Delivery = { clientReply: string; checklist: string[]; nextActions: NextAction[] }`

- [ ] **Step 1: 追加失败测试到 `lib/schema.test.ts`**

```ts
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- lib/schema.test.ts`
Expected: FAIL —— `CoreSchema`/`DeliverySchema` is not exported / undefined。

- [ ] **Step 3: 在 `lib/schema.ts` 追加两个子 schema(放在 `ActionCardSchema` 之后,`type` 导出之后)**

```ts
export const CoreSchema = z.object({
  needMoreInfo: z.boolean(),
  realDemand: RealDemandSchema,
  coreTension: z.array(TensionSchema),
  foresight: z.array(z.string()),
  evidence: z.array(z.string()),
  questionsToConfirm: z.array(z.string()),
});

export const DeliverySchema = z.object({
  clientReply: z.string(),
  checklist: z.array(z.string()),
  nextActions: z.array(NextActionSchema),
});

export type Core = z.infer<typeof CoreSchema>;
export type Delivery = z.infer<typeof DeliverySchema>;
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- lib/schema.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add lib/schema.ts lib/schema.test.ts
git -c user.email=wolfmanlyq@hotmail.com commit -m "feat: 新增 CoreSchema 与 DeliverySchema 子契约"
```

---

## Task 2: prompts 拆分(core / delivery,删除 analyze prompt)

**Files:**
- Modify: `lib/prompts.ts`
- Test: `lib/prompts.test.ts`

**Interfaces:**
- Consumes: `AnalyzeInput`, `Attachment`, `Core`(来自 Task 1)
- Produces:
  - `buildCorePrompt(input: AnalyzeInput): { system: string; user: string }`
  - `buildCoreContent(input: AnalyzeInput, attachments: Attachment[], opts?: { dropMultimodal?: boolean }): { system: string; content: AnalyzeContentBlock[] }`
  - `buildDeliveryPrompt(input: AnalyzeInput, core: Core): { system: string; user: string }`
  - 删除 `buildAnalyzePrompt`, `buildAnalyzeContent`(保留 `AnalyzeContentBlock` 类型、`buildInsightPrompt`、`buildPrototypePrompt`)

- [ ] **Step 1: 改写 `lib/prompts.test.ts`**

把现有引用 `buildAnalyzePrompt` / `buildAnalyzeContent` 的两段(顶部 import + "buildAnalyzePrompt 含 system…" 测试 + "buildAnalyzeContent" 那一组 5 个测试)替换为针对新函数。完整替换后的文件内容:

```ts
import { test, expect } from "vitest";
import { buildCorePrompt, buildPrototypePrompt, buildCoreContent, buildDeliveryPrompt, buildInsightPrompt } from "./prompts";
import type { AnalyzeInput } from "./demo";
import type { Attachment } from "./attachment";
import type { Core } from "./schema";

const input: AnalyzeInput = {
  feedback: "再高级一点,但别太硬广",
  projectType: "品牌海报",
  stage: "初稿反馈",
  audience: "设计",
  clientStyle: "保守",
};

test("buildCorePrompt 含 system、要求 JSON、产出 B 组字段、拼入用户输入", () => {
  const { system, user } = buildCorePrompt(input);
  expect(system).toMatch(/广告/);
  expect(system).toMatch(/JSON/);
  expect(system).toContain("realDemand");
  expect(system).toContain("coreTension");
  expect(system).toContain("questionsToConfirm");
  expect(system).not.toContain("clientReply"); // C 组字段不在 B
  expect(system).not.toContain("nextActions");
  expect(user).toContain("再高级一点");
  expect(user).toContain("品牌海报");
});

test("buildPrototypePrompt 要求自包含 HTML、含 name/highlight/recommend 且并入需求摘要", () => {
  const { system, user } = buildPrototypePrompt("客户要更想喝", "原始反馈文本");
  expect(system).toMatch(/HTML/);
  expect(system).toMatch(/内联|inline|自包含/);
  expect(system).toContain("highlight");
  expect(system).toContain("recommend");
  expect(user).toContain("客户要更想喝");
  expect(user).toContain("原始反馈文本");
});

const baseInput: AnalyzeInput = {
  feedback: "再高级一点", projectType: "品牌海报", stage: "初稿反馈", audience: "设计", clientStyle: "",
};
const pdfAtt: Attachment = { name: "brief.pdf", kind: "pdf", mediaType: "application/pdf", data: "QkFTRTY0" };
const txtAtt: Attachment = { name: "notes.txt", kind: "text", mediaType: "text/plain", data: "上一版偏冷淡" };
const imgAtt: Attachment = { name: "ref.png", kind: "image", mediaType: "image/png", data: "aW1n" };

test("buildCoreContent 无附件时只有一个 text 块且含反馈", () => {
  const { content } = buildCoreContent(baseInput, []);
  expect(content).toHaveLength(1);
  expect(content[0].type).toBe("text");
  expect((content[0] as { text: string }).text).toContain("再高级一点");
});

test("buildCoreContent PDF 附件生成 document 块", () => {
  const { content } = buildCoreContent(baseInput, [pdfAtt]);
  const doc = content.find((b) => b.type === "document") as { source: { media_type: string; data: string } } | undefined;
  expect(doc).toBeTruthy();
  expect(doc!.source.media_type).toBe("application/pdf");
  expect(doc!.source.data).toBe("QkFTRTY0");
});

test("buildCoreContent 图片附件生成 image 块", () => {
  const { content } = buildCoreContent(baseInput, [imgAtt]);
  expect(content.some((b) => b.type === "image")).toBe(true);
});

test("buildCoreContent 文本附件内容并进 text 块并标注文件名", () => {
  const { content } = buildCoreContent(baseInput, [txtAtt]);
  const textBlock = content.find((b) => b.type === "text") as { text: string };
  expect(textBlock.text).toContain("notes.txt");
  expect(textBlock.text).toContain("上一版偏冷淡");
});

test("buildCoreContent dropMultimodal 时不含 document/image 块,但保留文件名标注", () => {
  const { content } = buildCoreContent(baseInput, [pdfAtt, txtAtt], { dropMultimodal: true });
  expect(content.some((b) => b.type === "document" || b.type === "image")).toBe(false);
  const textBlock = content.find((b) => b.type === "text") as { text: string };
  expect(textBlock.text).toContain("brief.pdf");
});

test("buildInsightPrompt 只要 keyInsight+emotionIntensity 且拼入反馈", () => {
  const { system, user } = buildInsightPrompt(baseInput);
  expect(system).toContain("keyInsight");
  expect(system).toContain("emotionIntensity");
  expect(system).not.toContain("nextActions");
  expect(user).toContain("再高级一点");
});

const sampleCore: Core = {
  needMoreInfo: false,
  realDemand: { explicit: ["卖点更明确"], implicit: ["怕不卖货"] },
  coreTension: [{ left: "年轻化", right: "品牌质感", leftPercent: 65, rightPercent: 35, note: "n" }],
  foresight: ["下一轮会问为什么现在买"],
  evidence: ["客户先认可视觉"],
  questionsToConfirm: [],
};

test("buildDeliveryPrompt 产出 C 组字段、带入 core 分析、拼入反馈", () => {
  const { system, user } = buildDeliveryPrompt(input, sampleCore);
  expect(system).toMatch(/JSON/);
  expect(system).toContain("clientReply");
  expect(system).toContain("checklist");
  expect(system).toContain("nextActions");
  expect(user).toContain("再高级一点");        // 原始反馈
  expect(user).toContain("怕不卖货");           // 带入 core 的 implicit
  expect(user).toContain("年轻化");             // 带入 core 的 tension
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- lib/prompts.test.ts`
Expected: FAIL —— `buildCorePrompt` / `buildCoreContent` / `buildDeliveryPrompt` 未导出。

- [ ] **Step 3: 改写 `lib/prompts.ts`**

把 `buildAnalyzePrompt` 重命名/收窄为 `buildCorePrompt`(去掉 C 组字段 `clientReply`/`checklist`/`nextActions` 及对应规则,保留 keyInsight 之外的 B 组规则——注意 `keyInsight`/`emotionIntensity` 由 A 组产出,这里不要求它们)。把 `buildAnalyzeContent` 重命名为 `buildCoreContent` 并改为调用 `buildCorePrompt`。新增 `buildDeliveryPrompt`。完整新内容:

```ts
import type { AnalyzeInput } from "./demo";
import type { Attachment } from "./attachment";
import type { Core } from "./schema";

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

严格只输出 JSON,不要 Markdown,不要解释,结构如下:
{"needMoreInfo":false,"realDemand":{"explicit":["..."],"implicit":["..."]},"coreTension":[{"left":"...","right":"...","leftPercent":65,"rightPercent":35,"note":"..."}],"foresight":["..."],"evidence":["客户说'...' → 说明..."],"questionsToConfirm":["..."]}`;

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

严格只输出 JSON,不要 Markdown,不要解释:
{"keyInsight":"客户不是...,而是...","emotionIntensity":"..."}`;

  const user = `客户反馈原文:
${input.feedback}

项目场景:${input.projectType}
当前阶段:${input.stage}

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

严格只输出 JSON,不要 Markdown,不要解释,结构如下:
{"clientReply":"...","checklist":["..."],"nextActions":[{"role":"设计","title":"...","detail":"...","reason":"..."}]}`;

  const tensionText = core.coreTension.map((t) => `${t.left} vs ${t.right}(${t.note})`).join(";");
  const user = `客户反馈原文:
${input.feedback}

项目场景:${input.projectType}
当前阶段:${input.stage}
输出目标:${input.audience}

【已完成的分析结论】
他说出口的:${core.realDemand.explicit.join("、") || "(无)"}
他真正担心的:${core.realDemand.implicit.join("、") || "(无)"}
甲方纠结点:${tensionText || "(无)"}
需要确认的点:${core.questionsToConfirm.join("、") || "(无)"}

请基于以上分析,生成交付物 JSON。`;

  return { system, user };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- lib/prompts.test.ts`
Expected: PASS。(此时 `app/api/analyze/route.ts` 仍 import 旧函数会导致 tsc 报错,Task 4 删除它;本步只跑 prompts 单测。)

- [ ] **Step 5: 提交**

```bash
git add lib/prompts.ts lib/prompts.test.ts
git -c user.email=wolfmanlyq@hotmail.com commit -m "feat: 拆分 prompts 为 core / delivery,删除 analyze prompt"
```

---

## Task 3: `/api/decode/core` 与 `/api/decode/delivery` 路由

**Files:**
- Create: `app/api/decode/core/route.ts`
- Create: `app/api/decode/core/route.test.ts`
- Create: `app/api/decode/delivery/route.ts`
- Create: `app/api/decode/delivery/route.test.ts`

**Interfaces:**
- Consumes: `buildCorePrompt`, `buildCoreContent`, `buildDeliveryPrompt`(Task 2);`CoreSchema`, `DeliverySchema`, `Core`(Task 1);`getClient`, `MODEL`;`extractJson`;`AttachmentsSchema`, `attachmentsWithinLimit`, `Attachment`;`AnalyzeInput`
- Produces:
  - `POST` at `/api/decode/core` → 200 `Core`(降级时附 `attachmentsDropped: true`),错误同 analyze 模式
  - `POST` at `/api/decode/delivery` → 200 `Delivery`,缺/坏 `core` → 400

- [ ] **Step 1: 写 core 路由失败测试 `app/api/decode/core/route.test.ts`**

```ts
import { test, expect, vi, beforeEach } from "vitest";

const createMock = vi.fn();
const getClientMock = vi.fn(() => ({ messages: { create: createMock } }));
vi.mock("@/lib/anthropic", () => ({ MODEL: "claude-opus-4-8", getClient: () => getClientMock() }));

import { POST } from "./route";
import { DEMO_INPUT } from "@/lib/demo";

beforeEach(() => {
  createMock.mockReset();
  getClientMock.mockReset();
  getClientMock.mockImplementation(() => ({ messages: { create: createMock } }));
});

function req(body: unknown): Request {
  return new Request("http://localhost/api/decode/core", { method: "POST", body: JSON.stringify(body) });
}
function fakeMessage(text: string) { return { content: [{ type: "text", text }] }; }

const validCore = {
  needMoreInfo: false,
  realDemand: { explicit: ["卖点更明确"], implicit: ["促进到店"] },
  coreTension: [{ left: "年轻化", right: "品牌质感", leftPercent: 65, rightPercent: 35, note: "x" }],
  foresight: ["下一轮会问为什么现在买"],
  evidence: ["客户先认可视觉好看 → 说明问题不是审美"],
  questionsToConfirm: [],
};
const pdfAtt = { name: "brief.pdf", kind: "pdf", mediaType: "application/pdf", data: "QkFTRTY0" };

test("无附件:返回 Core,不含 attachmentsDropped", async () => {
  createMock.mockResolvedValue(fakeMessage(JSON.stringify(validCore)));
  const res = await POST(req(DEMO_INPUT));
  expect(res.status).toBe(200);
  const json = await res.json();
  expect(json.realDemand.explicit).toContain("卖点更明确");
  expect(json.attachmentsDropped).toBeUndefined();
});

test("带 PDF:content 含 document 块", async () => {
  createMock.mockResolvedValue(fakeMessage(JSON.stringify(validCore)));
  const res = await POST(req({ ...DEMO_INPUT, attachments: [pdfAtt] }));
  expect(res.status).toBe(200);
  const content = createMock.mock.calls[0][0].messages[0].content;
  expect(content.some((b: { type: string }) => b.type === "document")).toBe(true);
});

test("多模态失败:去掉文档块重试一次,标记 attachmentsDropped", async () => {
  createMock
    .mockImplementationOnce(() => { throw new Error("unsupported content block type document"); })
    .mockResolvedValueOnce(fakeMessage(JSON.stringify(validCore)));
  const res = await POST(req({ ...DEMO_INPUT, attachments: [pdfAtt] }));
  expect(res.status).toBe(200);
  const json = await res.json();
  expect(json.attachmentsDropped).toBe(true);
  const secondContent = createMock.mock.calls[1][0].messages[0].content;
  expect(secondContent.some((b: { type: string }) => b.type === "document")).toBe(false);
  expect(createMock).toHaveBeenCalledTimes(2);
});

test("超体积附件返回 400", async () => {
  const big = { ...pdfAtt, data: "a".repeat(4 * 1024 * 1024 + 1) };
  expect((await POST(req({ ...DEMO_INPUT, attachments: [big] }))).status).toBe(400);
});

test("缺 feedback 返回 400", async () => {
  expect((await POST(req({ ...DEMO_INPUT, feedback: "" }))).status).toBe(400);
});

test("无附件且 SDK 失败返回 500(不重试)", async () => {
  createMock.mockImplementation(() => { throw new Error("boom"); });
  const res = await POST(req(DEMO_INPUT));
  expect(res.status).toBe(500);
  expect((await res.json()).error).toContain("boom");
  expect(createMock).toHaveBeenCalledTimes(1);
});

test("无附件:首次坏内容,重试一次后成功", async () => {
  createMock
    .mockResolvedValueOnce(fakeMessage("(中转抽风)"))
    .mockResolvedValueOnce(fakeMessage(JSON.stringify(validCore)));
  const res = await POST(req(DEMO_INPUT));
  expect(res.status).toBe(200);
  expect(createMock).toHaveBeenCalledTimes(2);
});

test("无附件:两次坏内容,友好提示(不暴露 Zod 原文)", async () => {
  createMock.mockResolvedValue(fakeMessage("不是 JSON"));
  const res = await POST(req(DEMO_INPUT));
  expect(res.status).toBe(500);
  const json = await res.json();
  expect(json.error).toMatch(/模型返回内容异常|请重试/);
  expect(json.error).not.toMatch(/invalid_type|expected|needMoreInfo/);
  expect(createMock).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 2: 写 delivery 路由失败测试 `app/api/decode/delivery/route.test.ts`**

```ts
import { test, expect, vi, beforeEach } from "vitest";

const createMock = vi.fn();
const getClientMock = vi.fn(() => ({ messages: { create: createMock } }));
vi.mock("@/lib/anthropic", () => ({ MODEL: "claude-opus-4-8", getClient: () => getClientMock() }));

import { POST } from "./route";
import { DEMO_INPUT } from "@/lib/demo";

beforeEach(() => {
  createMock.mockReset();
  getClientMock.mockReset();
  getClientMock.mockImplementation(() => ({ messages: { create: createMock } }));
});

function req(body: unknown): Request {
  return new Request("http://localhost/api/decode/delivery", { method: "POST", body: JSON.stringify(body) });
}
function fakeMessage(text: string) { return { content: [{ type: "text", text }] }; }

const core = {
  needMoreInfo: false,
  realDemand: { explicit: ["卖点更明确"], implicit: ["怕不卖货"] },
  coreTension: [{ left: "年轻化", right: "品牌质感", leftPercent: 65, rightPercent: 35, note: "n" }],
  foresight: ["f"],
  evidence: ["e"],
  questionsToConfirm: [],
};
const validDelivery = {
  clientReply: "收到,我们理解……",
  checklist: ["强化产品卖点"],
  nextActions: [{ role: "设计", title: "重排层级", detail: "放大产品杯", reason: "补吸引力" }],
};

test("正常:返回 Delivery,且 core 摘要进了 prompt", async () => {
  createMock.mockResolvedValue(fakeMessage(JSON.stringify(validDelivery)));
  const res = await POST(req({ ...DEMO_INPUT, core }));
  expect(res.status).toBe(200);
  expect((await res.json()).clientReply).toBe("收到,我们理解……");
  const sentUser = createMock.mock.calls[0][0].messages[0].content;
  expect(sentUser).toContain("怕不卖货"); // core.implicit 带入
});

test("缺 core 返回 400", async () => {
  const res = await POST(req(DEMO_INPUT));
  expect(res.status).toBe(400);
  expect(createMock).not.toHaveBeenCalled();
});

test("core 不合法返回 400", async () => {
  const res = await POST(req({ ...DEMO_INPUT, core: { realDemand: 123 } }));
  expect(res.status).toBe(400);
});

test("缺 feedback 返回 400", async () => {
  const res = await POST(req({ feedback: "", core }));
  expect(res.status).toBe(400);
});

test("首次坏内容重试一次后成功", async () => {
  createMock
    .mockResolvedValueOnce(fakeMessage("(抽风)"))
    .mockResolvedValueOnce(fakeMessage(JSON.stringify(validDelivery)));
  const res = await POST(req({ ...DEMO_INPUT, core }));
  expect(res.status).toBe(200);
  expect(createMock).toHaveBeenCalledTimes(2);
});

test("两次坏内容返回友好提示(不暴露 Zod 原文)", async () => {
  createMock.mockResolvedValue(fakeMessage("不是 JSON"));
  const res = await POST(req({ ...DEMO_INPUT, core }));
  expect(res.status).toBe(500);
  const json = await res.json();
  expect(json.error).toMatch(/模型返回内容异常|请重试/);
  expect(json.error).not.toMatch(/invalid_type|expected/);
  expect(createMock).toHaveBeenCalledTimes(2);
});

test("SDK 连接错返回 500(不重试)", async () => {
  createMock.mockImplementation(() => { throw new Error("boom"); });
  const res = await POST(req({ ...DEMO_INPUT, core }));
  expect(res.status).toBe(500);
  expect((await res.json()).error).toContain("boom");
  expect(createMock).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 3: 运行两个测试确认失败**

Run: `npm test -- app/api/decode/core/route.test.ts app/api/decode/delivery/route.test.ts`
Expected: FAIL —— `./route` 模块不存在。

- [ ] **Step 4: 实现 `app/api/decode/core/route.ts`**(结构对照 analyze,parse 用 CoreSchema,prompt 用 core 版)

```ts
import { NextResponse } from "next/server";
import { getClient, MODEL } from "@/lib/anthropic";
import { CoreSchema, type Core } from "@/lib/schema";
import { buildCorePrompt, buildCoreContent } from "@/lib/prompts";
import { extractJson } from "@/lib/extract-json";
import { AttachmentsSchema, attachmentsWithinLimit } from "@/lib/attachment";
import type { AnalyzeInput } from "@/lib/demo";

export const runtime = "nodejs";

class BadModelOutput extends Error {}

export async function POST(request: Request): Promise<Response> {
  let body: AnalyzeInput & { attachments?: unknown };
  try {
    body = (await request.json()) as AnalyzeInput & { attachments?: unknown };
  } catch {
    return NextResponse.json({ error: "请求体解析失败" }, { status: 400 });
  }
  if (!body.feedback || body.feedback.trim().length < 4) {
    return NextResponse.json({ error: "请粘贴客户反馈内容" }, { status: 400 });
  }

  let attachments: import("@/lib/attachment").Attachment[] = [];
  if (body.attachments !== undefined) {
    const parsed = AttachmentsSchema.safeParse(body.attachments);
    if (!parsed.success) {
      return NextResponse.json({ error: "参考材料格式不合法" }, { status: 400 });
    }
    if (!attachmentsWithinLimit(parsed.data)) {
      return NextResponse.json({ error: "参考材料过大(单文件≤4MB,总量≤8MB)" }, { status: 400 });
    }
    attachments = parsed.data;
  }

  const input: AnalyzeInput = {
    feedback: body.feedback,
    projectType: body.projectType,
    stage: body.stage,
    audience: body.audience,
    clientStyle: body.clientStyle,
  };

  async function callModelText(dropMultimodal: boolean): Promise<string> {
    const built = attachments.length
      ? buildCoreContent(input, attachments, { dropMultimodal })
      : (() => {
          const { system, user } = buildCorePrompt(input);
          return { system, content: user };
        })();
    const msg = await getClient().messages.create({
      model: MODEL,
      max_tokens: 12000,
      system: built.system,
      messages: [{ role: "user", content: built.content }],
    });
    const textBlock = (msg.content as Array<{ type: string; text?: string }>).find(
      (b) => b.type === "text",
    );
    return textBlock?.text ?? "";
  }

  function parseCore(text: string): Core {
    try {
      return CoreSchema.parse(extractJson(text));
    } catch {
      throw new BadModelOutput("模型返回内容无法解析为分析结果");
    }
  }

  const FRIENDLY = "分析失败:模型返回内容异常,请重试。";

  if (!attachments.length) {
    try {
      return NextResponse.json(parseCore(await callModelText(false)));
    } catch (firstErr) {
      if (firstErr instanceof BadModelOutput) {
        try {
          return NextResponse.json(parseCore(await callModelText(false)));
        } catch (retryErr) {
          if (retryErr instanceof BadModelOutput) {
            console.error("[decode/core] 两次输出均无效");
            return NextResponse.json({ error: FRIENDLY }, { status: 500 });
          }
          return connectionError(retryErr);
        }
      }
      return connectionError(firstErr);
    }
  }

  try {
    return NextResponse.json(parseCore(await callModelText(false)));
  } catch {
    try {
      const core = parseCore(await callModelText(true));
      return NextResponse.json({ ...core, attachmentsDropped: true });
    } catch (secondErr) {
      if (secondErr instanceof BadModelOutput) {
        console.error("[decode/core] 降级后输出仍无效");
        return NextResponse.json({ error: FRIENDLY }, { status: 500 });
      }
      return connectionError(secondErr);
    }
  }

  function connectionError(e: unknown): Response {
    const m = e instanceof Error ? e.message : "未知错误";
    console.error("[decode/core] 调用失败", {
      message: m,
      cause: e instanceof Error ? (e as { cause?: unknown }).cause : undefined,
      baseUrl: process.env.ANTHROPIC_BASE_URL ?? "(default api.anthropic.com)",
      keySet: !!process.env.ANTHROPIC_API_KEY,
    });
    return NextResponse.json({ error: `分析失败:${m}` }, { status: 500 });
  }
}
```

- [ ] **Step 5: 实现 `app/api/decode/delivery/route.ts`**

```ts
import { NextResponse } from "next/server";
import { getClient, MODEL } from "@/lib/anthropic";
import { CoreSchema, DeliverySchema, type Delivery } from "@/lib/schema";
import { buildDeliveryPrompt } from "@/lib/prompts";
import { extractJson } from "@/lib/extract-json";
import type { AnalyzeInput } from "@/lib/demo";

export const runtime = "nodejs";

class BadModelOutput extends Error {}

export async function POST(request: Request): Promise<Response> {
  let body: AnalyzeInput & { core?: unknown };
  try {
    body = (await request.json()) as AnalyzeInput & { core?: unknown };
  } catch {
    return NextResponse.json({ error: "请求体解析失败" }, { status: 400 });
  }
  if (!body.feedback || body.feedback.trim().length < 4) {
    return NextResponse.json({ error: "请粘贴客户反馈内容" }, { status: 400 });
  }
  const parsedCore = CoreSchema.safeParse(body.core);
  if (!parsedCore.success) {
    return NextResponse.json({ error: "缺少有效的分析结果" }, { status: 400 });
  }

  const input: AnalyzeInput = {
    feedback: body.feedback,
    projectType: body.projectType,
    stage: body.stage,
    audience: body.audience,
    clientStyle: body.clientStyle,
  };

  async function callText(): Promise<string> {
    const { system, user } = buildDeliveryPrompt(input, parsedCore.data);
    const msg = await getClient().messages.create({
      model: MODEL,
      max_tokens: 4000,
      system,
      messages: [{ role: "user", content: user }],
    });
    const textBlock = (msg.content as Array<{ type: string; text?: string }>).find(
      (b) => b.type === "text",
    );
    return textBlock?.text ?? "";
  }

  function parseDelivery(text: string): Delivery {
    try {
      return DeliverySchema.parse(extractJson(text));
    } catch {
      throw new BadModelOutput("模型返回内容无法解析为交付物");
    }
  }

  const FRIENDLY = "交付内容生成失败:模型返回内容异常,请重试。";

  try {
    return NextResponse.json(parseDelivery(await callText()));
  } catch (firstErr) {
    if (firstErr instanceof BadModelOutput) {
      try {
        return NextResponse.json(parseDelivery(await callText()));
      } catch (retryErr) {
        if (retryErr instanceof BadModelOutput) {
          console.error("[decode/delivery] 两次输出均无效");
          return NextResponse.json({ error: FRIENDLY }, { status: 500 });
        }
        return connectionError(retryErr);
      }
    }
    return connectionError(firstErr);
  }

  function connectionError(e: unknown): Response {
    const m = e instanceof Error ? e.message : "未知错误";
    console.error("[decode/delivery] 调用失败", { message: m });
    return NextResponse.json({ error: `交付内容生成失败:${m}` }, { status: 500 });
  }
}
```

- [ ] **Step 6: 运行两个测试确认通过**

Run: `npm test -- app/api/decode/core/route.test.ts app/api/decode/delivery/route.test.ts`
Expected: PASS(两文件全部用例)。

- [ ] **Step 7: 提交**

```bash
git add app/api/decode/core/route.ts app/api/decode/core/route.test.ts app/api/decode/delivery/route.ts app/api/decode/delivery/route.test.ts
git -c user.email=wolfmanlyq@hotmail.com commit -m "feat: 新增 /api/decode/core 与 /api/decode/delivery 路由"
```

---

## Task 4: 删除 `/api/analyze`

**Files:**
- Delete: `app/api/analyze/route.ts`
- Delete: `app/api/analyze/route.test.ts`

**Interfaces:**
- Produces: 无;移除旧端点。此时 `app/page.tsx` 仍 fetch `/api/analyze`,Task 5 会改;本任务后 page.test.tsx 可能失败,Task 6 修。

- [ ] **Step 1: 删除文件**

```bash
git rm app/api/analyze/route.ts app/api/analyze/route.test.ts
```

- [ ] **Step 2: 确认没有源码再 import 旧 prompt/旧端点(page.tsx 的 fetch 字符串在 Task 5 处理;此处只查 import)**

Run: `grep -rn "buildAnalyzePrompt\|buildAnalyzeContent\|api/analyze/route" app lib`
Expected: 无输出(page.tsx 内的 `"/api/analyze"` 字符串 fetch 由 Task 5 改,不在本检查范围;若此命令命中 route 文件说明删除未完成)。

- [ ] **Step 3: 提交**

```bash
git -c user.email=wolfmanlyq@hotmail.com commit -m "refactor: 删除被拆分取代的 /api/analyze 路由"
```

---

## Task 5: 前端编排 `app/page.tsx`(A+B 并发,B 后发 C)

**Files:**
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `Core`, `Delivery`(Task 1);`/api/decode/core`、`/api/decode/delivery`(Task 3);`/api/insight`、`/api/prototypes`(已存在);`DecodeView` 新 props(Task 6 定义,但本任务先按下列契约传入)
- Produces: 传给 `DecodeView` 的 props:`insight`、`core`、`coreLoading`、`coreError`、`delivery`、`deliveryLoading`、`deliveryError`、`samples`、`samplesLoading`、`samplesError`、`input`、`initialStep`、`attachmentsDropped`、回调 `onBack`/`onReset`/`onDone`/`onNeedSamples`

> 注:本任务改完后,因 `DecodeView` 旧 prop(`card`/`cardLoading`)未改,tsc 会报错;Task 6 同步改 DecodeView。两任务一起让 tsc 干净。**建议本任务结尾不单独跑 tsc,Task 6 结尾统一验证。** 测试在 Task 6 修。

- [ ] **Step 1: 替换 `app/page.tsx` 全文**

```tsx
"use client";
import { useCallback, useRef, useState } from "react";
import { Landing } from "./components/Landing";
import { WorkflowHome } from "./components/WorkflowHome";
import { InputView } from "./components/InputView";
import { DecodeView } from "./components/DecodeView";
import type { AnalyzeInput } from "@/lib/demo";
import type { Core, Delivery } from "@/lib/schema";
import type { Insight } from "@/lib/insight";
import type { Prototype } from "@/lib/prototype";

type ViewId = "landing" | "workflow" | "input" | "decode";

export default function Page() {
  const [view, setView] = useState<ViewId>("landing");
  const [input, setInput] = useState<AnalyzeInput | null>(null);
  const [insight, setInsight] = useState<Insight | null>(null);
  const [decodeStep, setDecodeStep] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const [core, setCore] = useState<Core | null>(null);
  const [coreLoading, setCoreLoading] = useState(false);
  const [coreError, setCoreError] = useState<string | null>(null);

  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);

  const [samples, setSamples] = useState<Prototype[] | null>(null);
  const [samplesLoading, setSamplesLoading] = useState(false);
  const [samplesError, setSamplesError] = useState<string | null>(null);
  const samplesRequested = useRef(false);
  const [attachmentsDropped, setAttachmentsDropped] = useState(false);

  async function handleDecode(
    next: AnalyzeInput,
    attachments: import("@/lib/attachment").Attachment[],
  ) {
    // 原话立即显示(=用户输入);AI 字段分组异步填入。
    setError(null);
    setInsight(null);
    setCore(null);
    setCoreError(null);
    setDelivery(null);
    setDeliveryError(null);
    setSamples(null);
    setSamplesError(null);
    setAttachmentsDropped(false);
    samplesRequested.current = false;
    setInput(next);
    setDecodeStep(1);
    setView("decode");

    // A 快洞察:并发、独立;先回则 Step1 洞察秒显。失败静默。
    fetch("/api/insight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && d.keyInsight) setInsight(d as Insight);
      })
      .catch(() => {});

    // B 分析主体:并发。返回后填 Step2-5,并接着发起 C。
    setCoreLoading(true);
    try {
      const r = await fetch("/api/decode/core", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...next, attachments }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "分析失败");
      const coreData = data as Core & { attachmentsDropped?: boolean };
      setCore(coreData);
      setAttachmentsDropped(!!coreData.attachmentsDropped);
      setDecodeStep(coreData.needMoreInfo ? 5 : 1);
      void fetchDelivery(next, coreData);
    } catch (e) {
      setCoreError(e instanceof Error ? e.message : "未知错误");
    } finally {
      setCoreLoading(false);
    }
  }

  async function fetchDelivery(next: AnalyzeInput, coreData: Core) {
    setDeliveryLoading(true);
    setDeliveryError(null);
    try {
      const r = await fetch("/api/decode/delivery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...next, core: coreData }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "交付内容生成失败");
      setDelivery(data as Delivery);
    } catch (e) {
      setDeliveryError(e instanceof Error ? e.message : "未知错误");
    } finally {
      setDeliveryLoading(false);
    }
  }

  const fetchSamples = useCallback(async () => {
    if (samplesRequested.current || !core || !input) return;
    samplesRequested.current = true;
    setSamplesLoading(true);
    setSamplesError(null);
    try {
      const summary = [
        insight?.keyInsight,
        ...core.realDemand.explicit,
        ...core.realDemand.implicit,
        ...core.coreTension.map((t) => `${t.left} vs ${t.right}`),
      ]
        .filter(Boolean)
        .join("；");
      const r = await fetch("/api/prototypes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ needSummary: summary, rawFeedback: input.feedback }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "生成小样失败");
      setSamples(data.prototypes ?? []);
    } catch (e) {
      setSamplesError(e instanceof Error ? e.message : "未知错误");
    } finally {
      setSamplesLoading(false);
    }
  }, [core, input, insight]);

  return (
    <main className="scene">
      <div className="noise" aria-hidden="true" />

      {view === "landing" && <Landing onStart={() => setView("input")} />}

      {view === "workflow" && (
        <WorkflowHome
          hasResult={!!core}
          onNewSignal={() => setView("input")}
          onPickStep={(step) => {
            setDecodeStep(step);
            setView("decode");
          }}
        />
      )}

      {view === "input" && (
        <div style={{ display: "grid", placeItems: "center", width: "100%" }}>
          <InputView
            loading={coreLoading}
            onBack={() => setView("landing")}
            onDecode={handleDecode}
          />
          {error && (
            <p className="error-note" style={{ maxWidth: 1040, width: "100%" }}>
              ⚠️ {error}
            </p>
          )}
        </div>
      )}

      {view === "decode" && input && (
        <DecodeView
          key={decodeStep}
          insight={insight}
          core={core}
          coreLoading={coreLoading}
          coreError={coreError}
          delivery={delivery}
          deliveryLoading={deliveryLoading}
          deliveryError={deliveryError}
          input={input}
          initialStep={decodeStep}
          samples={samples}
          samplesLoading={samplesLoading}
          samplesError={samplesError}
          onBack={() => setView("input")}
          onReset={() => setView("input")}
          onDone={() => setView("workflow")}
          onNeedSamples={fetchSamples}
          attachmentsDropped={attachmentsDropped}
        />
      )}
    </main>
  );
}
```

- [ ] **Step 2: 确认 fetch 路径已切换**

Run: `grep -n "api/decode/core\|api/decode/delivery\|api/analyze" app/page.tsx`
Expected: 命中 core 与 delivery,**不**命中 analyze。

- [ ] **Step 3: 提交**

```bash
git add app/page.tsx
git -c user.email=wolfmanlyq@hotmail.com commit -m "feat: page 编排改为 A+B 并发、B 后发 C 的分组加载"
```

---

## Task 6: DecodeView 改用分组 props + page 测试改写(整体验证)

**Files:**
- Modify: `app/components/DecodeView.tsx`
- Modify: `app/page.test.tsx`

**Interfaces:**
- Consumes: `Core`, `Delivery`(Task 1);`Insight`;`AnalyzeInput`;`Prototype`;`PrototypeGallery`
- Produces: `DecodeView` props 见下;Step1 读 insight,Step2-5 读 core,Step6-7 读 delivery

- [ ] **Step 1: 替换 `app/components/DecodeView.tsx` 全文**

```tsx
"use client";
import { useEffect, useState, type CSSProperties } from "react";
import type { Core, Delivery } from "@/lib/schema";
import type { AnalyzeInput } from "@/lib/demo";
import type { Insight } from "@/lib/insight";
import type { Prototype } from "@/lib/prototype";
import { PrototypeGallery } from "./PrototypeGallery";

const STEPS = [
  { n: 1, short: "原声", full: "甲方原声带" },
  { n: 2, short: "明话", full: "他说出口的 & 他真正担心的" },
  { n: 3, short: "纠结", full: "甲方纠结点" },
  { n: 4, short: "多想", full: "提前替客户想一遍" },
  { n: 5, short: "追问", full: "还得问甲方爸爸" },
  { n: 6, short: "方向", full: "先给甲方看这几个方向" },
  { n: 7, short: "开工", full: "接下来谁动手" },
];

function Bullets({ items }: { items: string[] }) {
  if (!items.length) return <p style={{ color: "var(--dim)" }}>—</p>;
  return (
    <ul>
      {items.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ul>
  );
}

function Decoding() {
  return <p className="loading-note">解码中…正在听懂甲方的言外之意</p>;
}

export function DecodeView({
  insight,
  core,
  coreLoading,
  coreError,
  delivery,
  deliveryLoading,
  deliveryError,
  input,
  samples,
  samplesLoading,
  samplesError,
  initialStep,
  onBack,
  onReset,
  onDone,
  onNeedSamples,
  attachmentsDropped,
}: {
  insight?: Insight | null;
  core: Core | null;
  coreLoading?: boolean;
  coreError?: string | null;
  delivery: Delivery | null;
  deliveryLoading?: boolean;
  deliveryError?: string | null;
  input: AnalyzeInput;
  samples: Prototype[] | null;
  samplesLoading: boolean;
  samplesError: string | null;
  initialStep?: number;
  onBack: () => void;
  onReset: () => void;
  onDone: () => void;
  onNeedSamples: () => void;
  attachmentsDropped?: boolean;
}) {
  const [step, setStep] = useState(initialStep ?? (core?.needMoreInfo ? 5 : 1));
  const [maxVisited, setMaxVisited] = useState(step);
  const [picked, setPicked] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setMaxVisited((m) => Math.max(m, step));
    if (step === 6 && core) onNeedSamples();
  }, [step, core, onNeedSamples]);

  function go(n: number) {
    setStep(Math.max(1, Math.min(7, n)));
  }

  async function copyReply() {
    if (!delivery) return;
    try {
      await navigator.clipboard?.writeText(delivery.clientReply);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard 不可用 */
    }
  }

  const current = STEPS[step - 1];

  return (
    <section className="view decode-view active">
      <nav
        className="topbar glass"
        aria-label="解码步骤"
        style={{ ["--progress"]: `${((step - 1) / 6) * 86}%` } as CSSProperties}
      >
        {STEPS.map((s) => {
          const state = s.n === step ? " active" : s.n < maxVisited ? " done" : "";
          return (
            <button key={s.n} className={`nav-step${state}`} onClick={() => go(s.n)}>
              <span className="nav-num">{s.n}</span>
              <span className="nav-label">{s.n === step ? s.full : s.short}</span>
            </button>
          );
        })}
      </nav>

      <section className="step-stage">
        <article
          className={`step-panel glass${step === 6 ? " final-panel" : ""}`}
          data-panel={step}
        >
          <div className="step-head">
            <div>
              <div className="label">Step {step} / {current.full}</div>
              <h2>{current.full}</h2>
            </div>
            <span className="status-pill">
              {coreLoading && !core
                ? "Decoding"
                : core?.needMoreInfo && step === 5
                  ? "Need Confirm"
                  : "Decoded"}
            </span>
          </div>

          {/* Step 1 — 甲方原声带(原话立即显示)+ 言外之意(来自 A 快洞察) */}
          {step === 1 && (
            <>
              {attachmentsDropped && (
                <p className="error-note">⚠️ 附件未被模型读取(当前端点不支持),已仅按文本解码。</p>
              )}
              <div className="quote">{input.feedback}</div>
              {(() => {
                const k = insight?.keyInsight;
                const e = insight?.emotionIntensity;
                if (!k && !e) return <Decoding />;
                return (
                  <>
                    {k && <div className="key-insight-line">{k}</div>}
                    <div className="grid-2 metric-grid-compact" style={{ marginTop: 14 }}>
                      <div className="mini-card metric">
                        <strong>情绪强度</strong>
                        <span>{e || "—"}</span>
                      </div>
                      <div className="mini-card metric insight-metric">
                        <strong>言外之意</strong>
                        <span>{k || "—"}</span>
                      </div>
                    </div>
                  </>
                );
              })()}
            </>
          )}

          {/* Step 2-5 — 分析主体(B 组);未到时解码中,出错显示错误 */}
          {step >= 2 && step <= 5 && !core && (
            coreError ? <p className="error-note">⚠️ {coreError}</p> : <Decoding />
          )}

          {/* Step 2 — 明话 / 潜台词 */}
          {step === 2 && core && (
            <div className="grid-2 demand-grid">
              <div className="mini-card demand-card visible">
                <div className="demand-title">
                  <span className="icon">☼</span>
                  <h3>他说出口的</h3>
                </div>
                <p className="micro-copy">客户已经说出口的修改方向,先摆清楚。</p>
                <Bullets items={core.realDemand.explicit} />
              </div>
              <div className="mini-card demand-card subtext">
                <div className="demand-title">
                  <span className="icon">◑</span>
                  <h3>他真正担心的</h3>
                </div>
                <p className="micro-copy">不用猜,先把潜台词拆开再决定怎么推进。</p>
                <Bullets items={core.realDemand.implicit} />
              </div>
            </div>
          )}

          {/* Step 3 — 甲方纠结点 */}
          {step === 3 && core && (
            <div className="grid-2">
              {core.coreTension.length ? (
                core.coreTension.map((t, i) => (
                  <div className="vs-card tension-card" key={i}>
                    <div className="tension-row">
                      <span>{t.left}</span>
                      <b>VS</b>
                      <span>{t.right}</span>
                    </div>
                    <div className="tension-bar">
                      <div className="tension-fill" style={{ width: `${t.leftPercent}%` }} />
                    </div>
                    <div className="tension-percent">
                      <span>{t.leftPercent}%</span>
                      <span>{t.rightPercent}%</span>
                    </div>
                    <p className="tension-note">倾向判断:{t.note}</p>
                  </div>
                ))
              ) : (
                <p style={{ color: "var(--dim)" }}>未识别到明显纠结点。</p>
              )}
            </div>
          )}

          {/* Step 4 — 提前替客户想一遍 */}
          {step === 4 && core && (
            <div className="grid-2">
              <div className="mini-card">
                <h3>下一轮可能会被问到</h3>
                <div className="risk-list consulting">
                  {core.foresight.length ? (
                    core.foresight.map((r, i) => (
                      <div className="risk-item" key={i}>
                        {r}
                      </div>
                    ))
                  ) : (
                    <p style={{ color: "var(--dim)" }}>—</p>
                  )}
                </div>
              </div>
              <div className="mini-card">
                <h3>Evidence / 为什么要多想一步</h3>
                <Bullets items={core.evidence} />
              </div>
            </div>
          )}

          {/* Step 5 — 还得问甲方爸爸 */}
          {step === 5 && core && (
            <>
              <div className="grid-3">
                {core.questionsToConfirm.length ? (
                  core.questionsToConfirm.map((q, i) => (
                    <button
                      key={i}
                      className={`question-card${picked === q ? " active" : ""}`}
                      onClick={() => setPicked(q)}
                    >
                      {q}
                    </button>
                  ))
                ) : (
                  <p style={{ color: "var(--dim)" }}>本轮信息足够,无需额外反问。</p>
                )}
              </div>
              {picked && (
                <div className="generated-line">
                  老师,我们理解您希望下一版既解决购买理由,也保持品牌质感。这里想跟您确认一下:{picked}
                </div>
              )}
            </>
          )}

          {/* Step 6-7 — 交付(C 组);未到时解码中,出错显示错误 */}
          {step >= 6 && step <= 7 && !delivery && (
            deliveryError ? <p className="error-note">⚠️ {deliveryError}</p> : <Decoding />
          )}

          {/* Step 6 — 先给甲方看这几个方向(回复 + 清单 + 小样) */}
          {step === 6 && delivery && (
            <div className="delivery">
              <div className="reply-card">
                <h3>客户回复话术</h3>
                <div className="reply-row">
                  <div className="bubble">{delivery.clientReply || "—"}</div>
                  <button className="btn-ghost" onClick={copyReply}>
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>

              <div className="mini-card">
                <h3>修改清单</h3>
                <p className="micro-copy" style={{ textAlign: "left", marginBottom: 0 }}>
                  把模糊反馈变成可检查的下一版动作。
                </p>
                <div className="checklist-grid">
                  {delivery.checklist.length ? (
                    delivery.checklist.map((c, i) => (
                      <div className="check-card" key={i}>
                        <div className="check-top">
                          <span className="check-title">
                            <span className="check-icon">✦</span>第 {i + 1} 项
                          </span>
                          <span className="check-tag">待落地</span>
                        </div>
                        <p>{c}</p>
                      </div>
                    ))
                  ) : (
                    <p style={{ color: "var(--dim)" }}>—</p>
                  )}
                </div>
              </div>

              <div>
                <div className="label" style={{ marginBottom: 12 }}>
                  方向确认小样
                </div>
                {samplesLoading && (
                  <p className="loading-note">正在生成 2-3 个可点击方向小样,稍候…</p>
                )}
                {samplesError && <p className="error-note">⚠️ {samplesError}</p>}
                {samples && samples.length > 0 && (
                  <PrototypeGallery prototypes={samples} />
                )}
              </div>
            </div>
          )}

          {/* Step 7 — 接下来谁动手 */}
          {step === 7 && delivery && (
            <div className="grid-5">
              {delivery.nextActions.length ? (
                delivery.nextActions.map((r, i) => (
                  <div className="role-card" key={i}>
                    <b>{r.role}</b>
                    <h3>{r.title}</h3>
                    <p>
                      {r.detail}
                      <br />
                      <span className="label">WHY</span> {r.reason}
                    </p>
                  </div>
                ))
              ) : (
                <p style={{ color: "var(--dim)" }}>—</p>
              )}
            </div>
          )}

          <div className="step-actions">
            {step > 1 ? (
              <button className="btn-ghost" onClick={() => go(step - 1)}>
                上一步
              </button>
            ) : (
              <button className="btn-ghost" onClick={onBack}>
                返回输入
              </button>
            )}
            {step < 7 ? (
              <button className="btn-primary" onClick={() => go(step + 1)}>
                下一步
              </button>
            ) : (
              <div className="right-actions">
                <button className="btn-ghost" onClick={onReset}>
                  重新输入
                </button>
                <button className="btn-primary" onClick={onDone}>
                  完成
                </button>
              </div>
            )}
          </div>
        </article>
      </section>
    </section>
  );
}
```

> 说明:`deliveryLoading` 当前未在 UI 单独使用(C 未到时统一显示 `<Decoding/>`),但保留为 prop 以备后用并与 page 对齐。为避免未使用变量 lint,UI 中不引用它是可接受的——若 lint 报未使用,在解构处删除 `deliveryLoading` 与 `coreLoading` 中确实未用者。注意:`coreLoading` 在 status-pill 用到,保留;`deliveryLoading` 若触发未使用告警,从解构与类型中移除。

- [ ] **Step 2: 改写 `app/page.test.tsx` 全文**

```tsx
import { test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Page from "./page";

beforeEach(() => vi.restoreAllMocks());

const core = {
  needMoreInfo: false,
  realDemand: { explicit: ["卖点更明确"], implicit: ["促进到店"] },
  coreTension: [
    { left: "年轻化", right: "品牌质感", leftPercent: 65, rightPercent: 35, note: "想年轻又怕掉质感" },
  ],
  foresight: ["下一轮客户可能会问:用户为什么现在买"],
  evidence: ["客户先认可视觉好看 → 说明问题不是审美"],
  questionsToConfirm: [],
};

const delivery = {
  clientReply: "收到,我们理解……",
  checklist: ["强化产品卖点"],
  nextActions: [{ role: "设计", title: "重排层级", detail: "放大产品杯", reason: "补产品吸引力" }],
};

const insight = { keyInsight: "快洞察:客户其实怕不卖货。", emotionIntensity: "中高" };

const samples = {
  prototypes: [
    { name: "食欲感强化版", strategy: "先勾食欲", sampleCopy: "白桃冰美式", highlight: "第一眼想喝", recommend: "主推方向", html: "<h1>A</h1>" },
  ],
};

/** 按 URL 分发的 fetch mock。 */
function routeFetch(map: Record<string, unknown>) {
  return vi.fn((url: string) => {
    const key = Object.keys(map).find((k) => url.includes(k));
    const v = key ? map[key] : null;
    if (v && typeof v === "object" && "ok" in (v as object)) {
      return Promise.resolve(v as Response);
    }
    return Promise.resolve({ ok: true, json: async () => v } as unknown as Response);
  });
}

test("着陆→输入→解码:展示真实数据并在第6步生成小样", async () => {
  vi.stubGlobal(
    "fetch",
    routeFetch({
      "/api/insight": insight,
      "/api/decode/core": core,
      "/api/decode/delivery": delivery,
      "/api/prototypes": samples,
    }),
  );

  render(<Page />);
  await userEvent.click(screen.getByRole("button", { name: /Start Now/ }));
  await userEvent.click(screen.getByRole("button", { name: /开始解码/ }));

  await waitFor(() => expect(screen.getByText("中高")).toBeInTheDocument());

  await userEvent.click(screen.getByRole("button", { name: /方向/ }));
  await waitFor(() => expect(screen.getByText("食欲感强化版")).toBeInTheDocument());
  expect(document.querySelector("iframe")).not.toBeNull();
});

test("core 失败时在解码视图 Step2 显示错误(不退回输入页)", async () => {
  vi.stubGlobal(
    "fetch",
    routeFetch({
      "/api/insight": insight,
      "/api/decode/core": { ok: false, json: async () => ({ error: "炸了" }) },
    }),
  );
  render(<Page />);
  await userEvent.click(screen.getByRole("button", { name: /Start Now/ }));
  await userEvent.click(screen.getByRole("button", { name: /开始解码/ }));
  // 仍在解码页(原话可见),翻到 Step2 看到错误
  await waitFor(() => expect(document.querySelector(".quote")).not.toBeNull());
  await userEvent.click(screen.getByRole("button", { name: /明话/ }));
  await waitFor(() => expect(screen.getByText(/炸了/)).toBeInTheDocument());
});

test("attachmentsDropped 为真时(来自 core),Step1 显示降级提示", async () => {
  const droppedCore = { ...core, attachmentsDropped: true };
  vi.stubGlobal(
    "fetch",
    routeFetch({ "/api/insight": insight, "/api/decode/core": droppedCore, "/api/decode/delivery": delivery }),
  );
  render(<Page />);
  await userEvent.click(screen.getByRole("button", { name: /Start Now/ }));
  await userEvent.click(screen.getByRole("button", { name: /开始解码/ }));
  await waitFor(() => expect(screen.getByText(/附件未被模型读取/)).toBeInTheDocument());
});

test("点击解码后立即显示原话,不等任何调用返回", async () => {
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
  render(<Page />);
  await userEvent.click(screen.getByRole("button", { name: /Start Now/ }));
  await userEvent.click(screen.getByRole("button", { name: /开始解码/ }));
  await waitFor(() =>
    expect(document.querySelector(".quote")?.textContent ?? "").toMatch(/白桃/),
  );
  expect(screen.getByText(/解码中/)).toBeInTheDocument();
});

test("快洞察先回:Step1 言外之意先显示,core 尚未到达", async () => {
  let resolveCore: (v: unknown) => void = () => {};
  const corePending = new Promise((res) => { resolveCore = res; });
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url.includes("/api/insight")) {
        return Promise.resolve({ ok: true, json: async () => insight } as unknown as Response);
      }
      return corePending as Promise<Response>; // core 挂起
    }),
  );

  render(<Page />);
  await userEvent.click(screen.getByRole("button", { name: /Start Now/ }));
  await userEvent.click(screen.getByRole("button", { name: /开始解码/ }));

  await waitFor(() => expect(screen.getAllByText(/快洞察:客户其实怕不卖货/).length).toBeGreaterThan(0));

  resolveCore({ ok: true, json: async () => core });
});

test("core 已到但 delivery 挂起:Step6 显示解码中", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url.includes("/api/insight")) return Promise.resolve({ ok: true, json: async () => insight } as unknown as Response);
      if (url.includes("/api/decode/core")) return Promise.resolve({ ok: true, json: async () => core } as unknown as Response);
      return new Promise(() => {}); // delivery / prototypes 挂起
    }),
  );
  render(<Page />);
  await userEvent.click(screen.getByRole("button", { name: /Start Now/ }));
  await userEvent.click(screen.getByRole("button", { name: /开始解码/ }));
  // 等 core 到(Step2 数据可达),再翻到 Step6
  await userEvent.click(screen.getByRole("button", { name: /方向/ }));
  await waitFor(() => expect(screen.getByText(/解码中/)).toBeInTheDocument());
});
```

- [ ] **Step 3: 运行 page 测试确认通过**

Run: `npm test -- app/page.test.tsx`
Expected: PASS(全部用例)。

- [ ] **Step 4: 全量测试 + 类型检查**

Run: `npm test`
Expected: 全绿(无 analyze 残留;新 core/delivery/prompts/schema/page 用例通过)。

Run: `TMPDIR="$PWD/.vitest-tmp" npx tsc --noEmit`
Expected: 无输出(0 错误)。若报 `deliveryLoading` / `coreLoading` 未使用,按 Step1 说明从 DecodeView 解构与类型中移除未用者。

- [ ] **Step 5: 构建验证**

Run: `npm run build`
Expected: 构建成功,路由清单含 `/api/decode/core`、`/api/decode/delivery`,不含 `/api/analyze`。

- [ ] **Step 6: 提交**

```bash
git add app/components/DecodeView.tsx app/page.test.tsx
git -c user.email=wolfmanlyq@hotmail.com commit -m "feat: DecodeView 改用 insight/core/delivery 分组数据并更新测试"
```

---

## 验收清单(全部任务完成后)

- [ ] 点击解码:原话 0 延迟;言外之意(A)先到;Step2-5(B)随 core 点亮;Step6-7(C)随 delivery 点亮;小样进入 Step6 懒加载。
- [ ] 任一组失败只影响其步骤,不退回输入页。
- [ ] `npm test` 全绿、`npx tsc --noEmit` 干净、`npm run build` 成功。
- [ ] 中转端点、wrangler/部署配置未改动。

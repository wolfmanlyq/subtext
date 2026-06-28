# 历史材料喂给解码 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让"历史材料"抽屉真正把选中文件的内容(文本/PDF/图片)经 base64 多模态文档块送进 Claude 解码;中转端点不支持多模态时静默降级为仅文本+文件名并提示。

**Architecture:** 浏览器用 FileReader 读文件(文本 readAsText、PDF/图片 readAsDataURL→base64),组装成 `attachments[]` 随提交发给 `/api/analyze`;服务端用纯函数 `buildAnalyzeContent` 把附件拼成 Anthropic content 块(PDF→document、图片→image、文本→并进 user 文字),调用失败且含附件时去掉多模态块重试一次并标记 `attachmentsDropped`。不引入任何解析库(Workers 友好)。

**Tech Stack:** Next.js (App Router, TS) · @anthropic-ai/sdk (`claude-opus-4-8`) · Zod · Vitest + Testing Library

## Global Constraints

- 测试命令用 `npm run test`(脚本已把 `TMPDIR` 指向项目内 `.vitest-tmp`)。
- 不引入解析库(无 pdf-parse/mammoth/xlsx 等);仅 base64 + 模型多模态。
- mediaType 白名单:`text/plain`、`text/markdown`、`application/pdf`、`image/png`、`image/jpeg`、`image/webp`。
- 体积上限:单文件 `MAX_FILE_BYTES = 4 * 1024 * 1024`;总量 `MAX_TOTAL_BYTES = 8 * 1024 * 1024`(按 base64/文本字符串字节数估算)。
- 模型 `claude-opus-4-8`;错误返回可读 JSON `{error}`,不静默吞错。
- 提交作者用仓库已配置的 git 账号;commit message 末尾保留 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`。

---

## Task 1: Attachment 类型与校验(lib/attachment.ts)

**Files:**
- Create: `lib/attachment.ts`
- Test: `lib/attachment.test.ts`

**Interfaces:**
- Produces:
  - `type AttachmentKind = "text" | "pdf" | "image"`
  - `interface Attachment { name: string; kind: AttachmentKind; mediaType: string; data: string }`
  - `const AttachmentSchema: z.ZodType<Attachment>`
  - `const AttachmentsSchema: z.ZodType<Attachment[]>`
  - `const MAX_FILE_BYTES = 4194304`、`const MAX_TOTAL_BYTES = 8388608`
  - `function attachmentBytes(a: Attachment): number`(返回 data 字符串的 UTF-8 字节数)
  - `function attachmentsWithinLimit(list: Attachment[]): boolean`(每个 ≤ MAX_FILE_BYTES 且总和 ≤ MAX_TOTAL_BYTES)

- [ ] **Step 1: 写失败测试**

Create `lib/attachment.test.ts`:

```typescript
import { test, expect } from "vitest";
import {
  AttachmentSchema,
  AttachmentsSchema,
  attachmentsWithinLimit,
  MAX_FILE_BYTES,
} from "./attachment";

const pdf = { name: "a.pdf", kind: "pdf", mediaType: "application/pdf", data: "QkFTRTY0" };

test("合法附件通过校验", () => {
  expect(AttachmentSchema.safeParse(pdf).success).toBe(true);
});

test("kind 非枚举被拒绝", () => {
  expect(AttachmentSchema.safeParse({ ...pdf, kind: "video" }).success).toBe(false);
});

test("mediaType 不在白名单被拒绝", () => {
  expect(AttachmentSchema.safeParse({ ...pdf, mediaType: "application/zip" }).success).toBe(false);
});

test("空 data 被拒绝", () => {
  expect(AttachmentSchema.safeParse({ ...pdf, data: "" }).success).toBe(false);
});

test("AttachmentsSchema 接受数组", () => {
  expect(AttachmentsSchema.safeParse([pdf]).success).toBe(true);
});

test("单文件超过上限时 attachmentsWithinLimit 为 false", () => {
  const big = { ...pdf, data: "a".repeat(MAX_FILE_BYTES + 1) };
  expect(attachmentsWithinLimit([big])).toBe(false);
});

test("正常大小通过 attachmentsWithinLimit", () => {
  expect(attachmentsWithinLimit([pdf])).toBe(true);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test -- lib/attachment.test.ts`
Expected: FAIL — 找不到模块 `./attachment`。

- [ ] **Step 3: 实现**

Create `lib/attachment.ts`:

```typescript
import { z } from "zod";

export const MAX_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 8 * 1024 * 1024;

const MEDIA_TYPES = [
  "text/plain",
  "text/markdown",
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export type AttachmentKind = "text" | "pdf" | "image";

export const AttachmentSchema = z.object({
  name: z.string().min(1),
  kind: z.enum(["text", "pdf", "image"]),
  mediaType: z.enum(MEDIA_TYPES),
  data: z.string().min(1),
});

export const AttachmentsSchema = z.array(AttachmentSchema);

export type Attachment = z.infer<typeof AttachmentSchema>;

export function attachmentBytes(a: Attachment): number {
  // 字符串的 UTF-8 字节数(base64 为 ASCII,文本可能含多字节)
  return new TextEncoder().encode(a.data).length;
}

export function attachmentsWithinLimit(list: Attachment[]): boolean {
  let total = 0;
  for (const a of list) {
    const n = attachmentBytes(a);
    if (n > MAX_FILE_BYTES) return false;
    total += n;
  }
  return total <= MAX_TOTAL_BYTES;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm run test -- lib/attachment.test.ts`
Expected: PASS(7 个测试)。

- [ ] **Step 5: Commit**

```bash
git add lib/attachment.ts lib/attachment.test.ts
git commit -m "feat: Attachment 类型与 Zod 校验(类型/白名单/体积)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: 拼接 content 块(lib/prompts.ts 新增 buildAnalyzeContent)

**Files:**
- Modify: `lib/prompts.ts`
- Test: `lib/prompts.test.ts`

**Interfaces:**
- Consumes: `AnalyzeInput`(`lib/demo.ts`)、`Attachment`(`lib/attachment.ts`)、现有 `buildAnalyzePrompt(input)`
- Produces:
  - `interface AnalyzeContentBlock`(Anthropic 用户内容块的最小结构,见实现)
  - `function buildAnalyzeContent(input: AnalyzeInput, attachments: Attachment[], opts?: { dropMultimodal?: boolean }): { system: string; content: AnalyzeContentBlock[] }`
    - 文本附件:把其内容追加进首个 text 块,标注「参考材料:<name>」
    - PDF:`{ type:"document", source:{ type:"base64", media_type:"application/pdf", data } }`
    - 图片:`{ type:"image", source:{ type:"base64", media_type, data } }`
    - `dropMultimodal:true` 时跳过 document/image 块(仅保留文本块,内含文件名标注)
    - 无附件时:返回单个 text 块(等价于 `buildAnalyzePrompt` 的 user)

- [ ] **Step 1: 写失败测试(追加到现有 prompts.test.ts)**

在 `lib/prompts.test.ts` 末尾追加:

```typescript
import { buildAnalyzeContent } from "./prompts";
import type { Attachment } from "./attachment";

const baseInput = {
  feedback: "再高级一点",
  projectType: "品牌海报",
  stage: "初稿反馈",
  audience: "设计",
  clientStyle: "",
};

const pdfAtt: Attachment = { name: "brief.pdf", kind: "pdf", mediaType: "application/pdf", data: "QkFTRTY0" };
const txtAtt: Attachment = { name: "notes.txt", kind: "text", mediaType: "text/plain", data: "上一版偏冷淡" };
const imgAtt: Attachment = { name: "ref.png", kind: "image", mediaType: "image/png", data: "aW1n" };

test("无附件时只有一个 text 块且含反馈", () => {
  const { content } = buildAnalyzeContent(baseInput, []);
  expect(content).toHaveLength(1);
  expect(content[0].type).toBe("text");
  expect((content[0] as { text: string }).text).toContain("再高级一点");
});

test("PDF 附件生成 document 块", () => {
  const { content } = buildAnalyzeContent(baseInput, [pdfAtt]);
  const doc = content.find((b) => b.type === "document") as
    | { source: { media_type: string; data: string } }
    | undefined;
  expect(doc).toBeTruthy();
  expect(doc!.source.media_type).toBe("application/pdf");
  expect(doc!.source.data).toBe("QkFTRTY0");
});

test("图片附件生成 image 块", () => {
  const { content } = buildAnalyzeContent(baseInput, [imgAtt]);
  expect(content.some((b) => b.type === "image")).toBe(true);
});

test("文本附件内容并进 text 块并标注文件名", () => {
  const { content } = buildAnalyzeContent(baseInput, [txtAtt]);
  const textBlock = content.find((b) => b.type === "text") as { text: string };
  expect(textBlock.text).toContain("notes.txt");
  expect(textBlock.text).toContain("上一版偏冷淡");
});

test("dropMultimodal 时不含 document/image 块,但保留文件名标注", () => {
  const { content } = buildAnalyzeContent(baseInput, [pdfAtt, txtAtt], { dropMultimodal: true });
  expect(content.some((b) => b.type === "document" || b.type === "image")).toBe(false);
  const textBlock = content.find((b) => b.type === "text") as { text: string };
  expect(textBlock.text).toContain("brief.pdf"); // 文件名仍标注
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test -- lib/prompts.test.ts`
Expected: FAIL — `buildAnalyzeContent` 未导出。

- [ ] **Step 3: 实现(在 lib/prompts.ts 末尾追加)**

```typescript
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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm run test -- lib/prompts.test.ts`
Expected: PASS(原有 2 + 新增 5 = 7 个)。

- [ ] **Step 5: Commit**

```bash
git add lib/prompts.ts lib/prompts.test.ts
git commit -m "feat: buildAnalyzeContent 把附件拼成多模态 content 块

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: analyze 路由接附件 + 降级重试

**Files:**
- Modify: `app/api/analyze/route.ts`
- Test: `app/api/analyze/route.test.ts`

**Interfaces:**
- Consumes: `buildAnalyzeContent`、`AttachmentsSchema`、`attachmentsWithinLimit`、`getClient`、`MODEL`、`ActionCardSchema`、`extractJson`
- Produces: `POST` 行为 —
  - body 形如 `AnalyzeInput & { attachments?: Attachment[] }`
  - attachments 非法(Zod 失败)或超体积 → 400
  - 有附件:用多模态 content 调用;catch 且 attachments 非空 → 用 `dropMultimodal:true` 重试一次,成功则响应体合并 `{ attachmentsDropped: true }`
  - 无附件:行为与现状一致(单 text 块,响应不含 attachmentsDropped)

- [ ] **Step 1: 写失败测试(替换现有 route.test.ts)**

Create/replace `app/api/analyze/route.test.ts`:

```typescript
import { test, expect, vi, beforeEach } from "vitest";

const createMock = vi.fn();
const getClientMock = vi.fn(() => ({ messages: { create: createMock } }));
vi.mock("@/lib/anthropic", () => ({
  MODEL: "claude-opus-4-8",
  getClient: () => getClientMock(),
}));

import { POST } from "./route";
import { DEMO_INPUT } from "@/lib/demo";

beforeEach(() => {
  createMock.mockReset();
  getClientMock.mockReset();
  getClientMock.mockImplementation(() => ({ messages: { create: createMock } }));
});

function req(body: unknown): Request {
  return new Request("http://localhost/api/analyze", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
function fakeMessage(text: string) {
  return { content: [{ type: "text", text }] };
}

const validCard = {
  needMoreInfo: false,
  emotionIntensity: "中高",
  keyInsight: "客户不是觉得画面不好看,而是担心广告好看但不卖货。",
  realDemand: { explicit: ["卖点更明确"], implicit: ["促进到店"] },
  coreTension: [{ left: "年轻化", right: "品牌质感", leftPercent: 65, rightPercent: 35, note: "x" }],
  foresight: ["下一轮会问为什么现在买"],
  evidence: ["客户先认可视觉好看 → 说明问题不是审美"],
  questionsToConfirm: [],
  nextActions: [{ role: "设计", title: "重排层级", detail: "放大产品杯", reason: "补吸引力" }],
  checklist: ["强化产品卖点"],
  clientReply: "收到",
};
const pdfAtt = { name: "brief.pdf", kind: "pdf", mediaType: "application/pdf", data: "QkFTRTY0" };

test("无附件:与现状一致,响应不含 attachmentsDropped", async () => {
  createMock.mockResolvedValue(fakeMessage(JSON.stringify(validCard)));
  const res = await POST(req(DEMO_INPUT));
  expect(res.status).toBe(200);
  const json = await res.json();
  expect(json.clientReply).toBe("收到");
  expect(json.attachmentsDropped).toBeUndefined();
});

test("带 PDF 附件:传给 SDK 的 content 含 document 块", async () => {
  createMock.mockResolvedValue(fakeMessage(JSON.stringify(validCard)));
  const res = await POST(req({ ...DEMO_INPUT, attachments: [pdfAtt] }));
  expect(res.status).toBe(200);
  const callArg = createMock.mock.calls[0][0];
  const content = callArg.messages[0].content;
  expect(Array.isArray(content)).toBe(true);
  expect(content.some((b: { type: string }) => b.type === "document")).toBe(true);
});

test("多模态失败:去掉文档块重试一次,成功并标记 attachmentsDropped", async () => {
  createMock
    .mockImplementationOnce(() => {
      throw new Error("messages.0.content.1: unsupported content block type document");
    })
    .mockResolvedValueOnce(fakeMessage(JSON.stringify(validCard)));
  const res = await POST(req({ ...DEMO_INPUT, attachments: [pdfAtt] }));
  expect(res.status).toBe(200);
  const json = await res.json();
  expect(json.attachmentsDropped).toBe(true);
  // 第二次调用不含 document 块
  const secondContent = createMock.mock.calls[1][0].messages[0].content;
  expect(secondContent.some((b: { type: string }) => b.type === "document")).toBe(false);
});

test("超体积附件返回 400", async () => {
  const big = { ...pdfAtt, data: "a".repeat(4 * 1024 * 1024 + 1) };
  const res = await POST(req({ ...DEMO_INPUT, attachments: [big] }));
  expect(res.status).toBe(400);
});

test("非法附件(kind 非枚举)返回 400", async () => {
  const bad = { ...pdfAtt, kind: "video" };
  const res = await POST(req({ ...DEMO_INPUT, attachments: [bad] }));
  expect(res.status).toBe(400);
});

test("缺 feedback 返回 400", async () => {
  const res = await POST(req({ ...DEMO_INPUT, feedback: "" }));
  expect(res.status).toBe(400);
});

test("无附件且 SDK 失败返回 500(不重试)", async () => {
  createMock.mockImplementation(() => {
    throw new Error("boom");
  });
  const res = await POST(req(DEMO_INPUT));
  expect(res.status).toBe(500);
  const json = await res.json();
  expect(json.error).toContain("boom");
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test -- app/api/analyze/route.test.ts`
Expected: FAIL — 路由尚未支持 attachments(document 块断言/降级断言失败)。

- [ ] **Step 3: 实现(替换 app/api/analyze/route.ts)**

```typescript
import { NextResponse } from "next/server";
import { getClient, MODEL } from "@/lib/anthropic";
import { ActionCardSchema } from "@/lib/schema";
import { buildAnalyzePrompt, buildAnalyzeContent } from "@/lib/prompts";
import { extractJson } from "@/lib/extract-json";
import { AttachmentsSchema, attachmentsWithinLimit } from "@/lib/attachment";
import type { AnalyzeInput } from "@/lib/demo";

export const runtime = "nodejs";

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

  // 校验附件
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

  async function callModel(dropMultimodal: boolean) {
    const built = attachments.length
      ? buildAnalyzeContent(input, attachments, { dropMultimodal })
      : (() => {
          const { system, user } = buildAnalyzePrompt(input);
          return { system, content: user };
        })();
    const msg = await getClient().messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: built.system,
      messages: [{ role: "user", content: built.content }],
    });
    const textBlock = (msg.content as Array<{ type: string; text?: string }>).find(
      (b) => b.type === "text",
    );
    return ActionCardSchema.parse(extractJson(textBlock?.text ?? ""));
  }

  try {
    const card = await callModel(false);
    return NextResponse.json(card);
  } catch (firstErr) {
    // 有附件 → 去掉多模态块重试一次
    if (attachments.length) {
      try {
        const card = await callModel(true);
        return NextResponse.json({ ...card, attachmentsDropped: true });
      } catch (secondErr) {
        const m = secondErr instanceof Error ? secondErr.message : "未知错误";
        console.error("[analyze] 降级重试仍失败", { message: m });
        return NextResponse.json({ error: `需求分析失败:${m}` }, { status: 500 });
      }
    }
    const m = firstErr instanceof Error ? firstErr.message : "未知错误";
    console.error("[analyze] 调用失败", {
      message: m,
      cause: firstErr instanceof Error ? (firstErr as { cause?: unknown }).cause : undefined,
      baseUrl: process.env.ANTHROPIC_BASE_URL ?? "(default api.anthropic.com)",
      keySet: !!process.env.ANTHROPIC_API_KEY,
    });
    return NextResponse.json({ error: `需求分析失败:${m}` }, { status: 500 });
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm run test -- app/api/analyze/route.test.ts`
Expected: PASS(7 个测试)。

- [ ] **Step 5: tsc 检查**

Run: `npx tsc --noEmit`
Expected: 无错误。

- [ ] **Step 6: Commit**

```bash
git add app/api/analyze/route.ts app/api/analyze/route.test.ts
git commit -m "feat: /api/analyze 接收附件并支持多模态失败降级重试

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: InputView 真读文件内容并传出 attachments

**Files:**
- Modify: `app/components/InputView.tsx`
- Test: `app/components/InputView.test.tsx`

**Interfaces:**
- Consumes: `Attachment`、`AttachmentKind`、`MAX_FILE_BYTES`、`MAX_TOTAL_BYTES`(`lib/attachment.ts`)
- Produces: `InputView` 的 `onDecode` 签名改为 `(input: AnalyzeInput, attachments: Attachment[]) => void`
  - 上传时读内容:text/markdown → `readAsText`;pdf/image → `readAsDataURL` 后取逗号后的 base64
  - 文件列表项含 `{ id, name, kind, mediaType, data, selected }`
  - 提交时把选中的项映射为 `Attachment[]`(去掉 id/selected)传给 `onDecode`
  - 非白名单类型上传时跳过并提示;单文件超 `MAX_FILE_BYTES` 跳过并提示

- [ ] **Step 1: 写失败测试(替换 InputView.test.tsx 中提交相关用例,新增附件用例)**

Create/replace `app/components/InputView.test.tsx`:

```typescript
import { test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InputView } from "./InputView";

test("默认填入示例反馈;onDecode 第二参数为 attachments 数组", async () => {
  const onDecode = vi.fn();
  render(<InputView loading={false} onBack={vi.fn()} onDecode={onDecode} />);
  expect((screen.getByLabelText("客户反馈") as HTMLTextAreaElement).value).toContain("白桃");
  await userEvent.click(screen.getByRole("button", { name: "活动促销" }));
  await userEvent.click(screen.getByRole("button", { name: /开始解码/ }));
  expect(onDecode).toHaveBeenCalledTimes(1);
  const [input, attachments] = onDecode.mock.calls[0];
  expect(input.projectType).toBe("活动促销");
  expect(Array.isArray(attachments)).toBe(true);
  expect(attachments).toHaveLength(0);
});

test("上传并选用文本文件后,提交携带该 attachment(含内容)", async () => {
  const onDecode = vi.fn();
  render(<InputView loading={false} onBack={vi.fn()} onDecode={onDecode} />);
  await userEvent.click(screen.getByRole("button", { name: /历史记录/ }));
  const file = new File(["上一版偏冷淡"], "notes.txt", { type: "text/plain" });
  const input = screen.getByLabelText(/上传/) as HTMLInputElement;
  await userEvent.upload(input, file);
  await userEvent.click(await screen.findByRole("button", { name: "使用此文件" }));
  await userEvent.click(screen.getByRole("button", { name: /开始解码/ }));
  const attachments = onDecode.mock.calls[0][1];
  expect(attachments).toHaveLength(1);
  expect(attachments[0].name).toBe("notes.txt");
  expect(attachments[0].kind).toBe("text");
  expect(attachments[0].data).toContain("上一版偏冷淡");
});

test("自定义场景:确认后用自定义值", async () => {
  const onDecode = vi.fn();
  render(<InputView loading={false} onBack={vi.fn()} onDecode={onDecode} />);
  await userEvent.click(screen.getByRole("button", { name: "自定义" }));
  await userEvent.type(screen.getByLabelText("自定义场景"), "门店开业");
  await userEvent.click(screen.getByRole("button", { name: "确认" }));
  await userEvent.click(screen.getByRole("button", { name: /开始解码/ }));
  expect(onDecode.mock.calls[0][0].projectType).toBe("门店开业");
});

test("Back 触发 onBack", async () => {
  const onBack = vi.fn();
  render(<InputView loading={false} onBack={onBack} onDecode={vi.fn()} />);
  await userEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(onBack).toHaveBeenCalled();
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test -- app/components/InputView.test.tsx`
Expected: FAIL — `onDecode` 仍是单参数 / 文件未真读内容。

- [ ] **Step 3: 实现(替换 app/components/InputView.tsx)**

```tsx
"use client";
import { useState } from "react";
import { DEMO_INPUT, type AnalyzeInput } from "@/lib/demo";
import {
  type Attachment,
  type AttachmentKind,
  MAX_FILE_BYTES,
} from "@/lib/attachment";

const SCENES = ["新品上市", "活动促销", "社媒种草", "短视频脚本"];
const STAGES = ["初稿反馈", "二轮修改", "执行前确认"];
const GOALS = ["整理需求", "行动建议", "方向小样", "客户回复"];

const KIND_BY_MEDIA: Record<string, AttachmentKind> = {
  "text/plain": "text",
  "text/markdown": "text",
  "application/pdf": "pdf",
  "image/png": "image",
  "image/jpeg": "image",
  "image/webp": "image",
};

interface LoadedFile {
  id: string;
  name: string;
  kind: AttachmentKind;
  mediaType: string;
  data: string;
  selected: boolean;
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result ?? "");
      const comma = s.indexOf(",");
      resolve(comma >= 0 ? s.slice(comma + 1) : s);
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function InputView({
  loading,
  onBack,
  onDecode,
}: {
  loading: boolean;
  onBack: () => void;
  onDecode: (input: AnalyzeInput, attachments: Attachment[]) => void;
}) {
  const [feedback, setFeedback] = useState(DEMO_INPUT.feedback);
  const [projectType, setProjectType] = useState("新品上市");
  const [stage, setStage] = useState("初稿反馈");
  const [goals, setGoals] = useState<string[]>(["整理需求"]);
  const [customOpen, setCustomOpen] = useState(false);
  const [customValue, setCustomValue] = useState("");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [files, setFiles] = useState<LoadedFile[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const customActive = !SCENES.includes(projectType);
  const selected = files.filter((f) => f.selected);

  function pickScene(s: string) {
    setProjectType(s);
    setCustomOpen(false);
  }
  function confirmCustom() {
    const v = customValue.trim();
    if (!v) return;
    setProjectType(v);
    setCustomOpen(false);
  }
  function toggleGoal(g: string) {
    setGoals((p) => (p.includes(g) ? p.filter((x) => x !== g) : [...p, g]));
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    const loaded: LoadedFile[] = [];
    for (const file of picked) {
      const kind = KIND_BY_MEDIA[file.type];
      if (!kind) {
        setNotice(`跳过不支持的文件类型:${file.name}`);
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        setNotice(`跳过过大文件(>4MB):${file.name}`);
        continue;
      }
      const data = kind === "text" ? await readAsText(file) : await readAsBase64(file);
      loaded.push({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: file.name,
        kind,
        mediaType: file.type,
        data,
        selected: false,
      });
    }
    if (loaded.length) setFiles((prev) => [...loaded, ...prev]);
  }
  function toggleFile(id: string) {
    setFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, selected: !f.selected } : f)),
    );
  }
  function removeFile(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }

  function submit() {
    const attachments: Attachment[] = selected.map((f) => ({
      name: f.name,
      kind: f.kind,
      mediaType: f.mediaType,
      data: f.data,
    }));
    onDecode(
      { feedback, projectType, stage, audience: goals.join(" / "), clientStyle: "" },
      attachments,
    );
  }

  return (
    <section className="view input-view active">
      <article className="input-card glass">
        <div className="input-head">
          <div>
            <div className="label">Raw Signal</div>
            <h2>甲方爸爸的话</h2>
            <p>把客户微信、邮件、会议纪要或方案批注放进来,不用整理,越原始越真实。</p>
          </div>
          <button className="btn-ghost" onClick={onBack}>
            Back
          </button>
        </div>

        <div className="feedback-wrap">
          <textarea
            aria-label="客户反馈"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="粘贴微信聊天 / 邮件 / 会议纪要 / 方案批注……"
          />
          <button
            type="button"
            className="history-btn"
            onClick={() => setDrawerOpen(true)}
          >
            ⌁ 历史记录
          </button>
        </div>
        {selected.length > 0 && (
          <div className="selected-ref">
            已选择参考材料:{selected.map((f) => f.name).join(" / ")}
          </div>
        )}

        <div className="chip-groups">
          <div className="chip-group option-card">
            <div className="chip-title">项目场景</div>
            <div className="chips">
              {SCENES.map((s) => (
                <button
                  key={s}
                  className={`chip${projectType === s ? " active" : ""}`}
                  onClick={() => pickScene(s)}
                >
                  {s}
                </button>
              ))}
              <button
                className={`chip${customActive ? " active" : ""}`}
                onClick={() => setCustomOpen(true)}
              >
                {customActive ? projectType : "自定义"}
              </button>
            </div>
            {customOpen && (
              <div className="custom-scene show">
                <input
                  aria-label="自定义场景"
                  placeholder="输入项目场景"
                  value={customValue}
                  onChange={(e) => setCustomValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && confirmCustom()}
                />
                <button className="btn-ghost" onClick={confirmCustom}>
                  确认
                </button>
              </div>
            )}
          </div>

          <div className="chip-group option-card">
            <div className="chip-title">当前阶段</div>
            <div className="chips">
              {STAGES.map((t) => (
                <button
                  key={t}
                  className={`chip${stage === t ? " active" : ""}`}
                  onClick={() => setStage(t)}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="chip-group option-card">
            <div className="chip-title">输出目标</div>
            <div className="chips">
              {GOALS.map((t) => (
                <button
                  key={t}
                  className={`chip${goals.includes(t) ? " active" : ""}`}
                  onClick={() => toggleGoal(t)}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="input-actions">
          <span className="label">Agent Input Console</span>
          <button
            className="btn-primary"
            disabled={loading || feedback.trim().length < 4}
            onClick={submit}
          >
            {loading ? "解码中…" : "开始解码 Decode Feedback"}
          </button>
        </div>
      </article>

      {drawerOpen && (
        <>
          <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} />
          <aside className="history-drawer" aria-label="历史甲方原话">
            <div className="drawer-head">
              <div>
                <div className="label">Local References</div>
                <h2>历史甲方原话</h2>
                <p>上传本地文件作为本次解码的参考材料(文本/PDF/图片;在浏览器读取,随解码一起发送)。</p>
              </div>
              <button className="btn-ghost" onClick={() => setDrawerOpen(false)}>
                关闭
              </button>
            </div>

            <label className="upload-zone">
              <strong>点击上传历史材料</strong>
              <span>支持 文本 / PDF / 图片(单文件 ≤ 4MB)</span>
              <small>{notice ?? "文件在浏览器读取后随解码请求发送。"}</small>
              <input
                aria-label="上传历史材料"
                type="file"
                multiple
                accept=".txt,.md,.pdf,.png,.jpg,.jpeg,.webp"
                onChange={onUpload}
              />
            </label>

            <div className="file-list">
              {files.length === 0 ? (
                <div className="empty-files">还没有上传文件。</div>
              ) : (
                files.map((f) => (
                  <div key={f.id} className={`file-card${f.selected ? " active" : ""}`}>
                    <div className="file-icon">{f.kind.toUpperCase()}</div>
                    <div>
                      <div className="file-name" title={f.name}>
                        {f.name}
                      </div>
                      <div className="file-info">
                        {f.selected ? "已作为参考材料" : "等待选用"}
                      </div>
                      <div className="file-actions">
                        <button onClick={() => toggleFile(f.id)}>
                          {f.selected ? "取消选用" : "使用此文件"}
                        </button>
                        <button onClick={() => removeFile(f.id)}>移除</button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="drawer-actions">
              <button onClick={() => setDrawerOpen(false)}>确认使用</button>
            </div>
          </aside>
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm run test -- app/components/InputView.test.tsx`
Expected: PASS(4 个测试)。

- [ ] **Step 5: Commit**

```bash
git add app/components/InputView.tsx app/components/InputView.test.tsx
git commit -m "feat: InputView 真读文件内容并随提交传出 attachments

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: page 透传附件 + DecodeView 提示;全量验证

**Files:**
- Modify: `app/page.tsx`, `app/components/DecodeView.tsx`
- Test: `app/page.test.tsx`

**Interfaces:**
- Consumes: `InputView` 的新 `onDecode(input, attachments)`、`/api/analyze` 响应可能含 `attachmentsDropped`
- Produces:
  - `page` 把 attachments 放进 `/api/analyze` 的请求体;把响应 `attachmentsDropped` 存 state,作为 `attachmentsDropped` prop 传给 `DecodeView`
  - `DecodeView` 新增可选 prop `attachmentsDropped?: boolean`,为真时在 Step1 顶部显示提示条 `附件未被模型读取(当前端点不支持),已仅按文本解码`

- [ ] **Step 1: 写失败测试(在 app/page.test.tsx 追加用例)**

在 `app/page.test.tsx` 末尾追加:

```typescript
test("attachmentsDropped 为真时,解码视图显示降级提示", async () => {
  const droppedCard = { ...card, attachmentsDropped: true };
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValueOnce({ ok: true, json: async () => droppedCard }),
  );
  render(<Page />);
  await userEvent.click(screen.getByRole("button", { name: /Start Now/ }));
  await userEvent.click(screen.getByRole("button", { name: /甲方爸爸的话/ }));
  await userEvent.click(screen.getByRole("button", { name: /开始解码/ }));
  await waitFor(() =>
    expect(screen.getByText(/附件未被模型读取/)).toBeInTheDocument(),
  );
});
```

> 注:`card` 常量已在该文件顶部定义(上一轮实现),此处复用。

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test -- app/page.test.tsx`
Expected: FAIL — 提示文案未渲染。

- [ ] **Step 3a: 改 DecodeView 接收并显示提示**

在 `app/components/DecodeView.tsx` 的 props 解构与类型中加入 `attachmentsDropped`:

把函数签名参数对象里加 `attachmentsDropped,`(在 `onNeedSamples,` 同级),类型块加 `attachmentsDropped?: boolean;`。

然后在 Step 1 渲染块的最前面(`{step === 1 && (` 之后的 `<>` 内,`<div className="quote">` 之前)插入:

```tsx
{attachmentsDropped && (
  <p className="error-note">⚠️ 附件未被模型读取(当前端点不支持),已仅按文本解码。</p>
)}
```

- [ ] **Step 3b: 改 page 透传**

在 `app/page.tsx`:

1) 新增 state(在 `samplesRequested` 附近):

```tsx
const [attachmentsDropped, setAttachmentsDropped] = useState(false);
```

2) 把 `handleDecode` 签名改为接收 attachments,并放进请求体、读取响应标记。将原函数替换为:

```tsx
async function handleDecode(
  next: AnalyzeInput,
  attachments: import("@/lib/attachment").Attachment[],
) {
  setLoading(true);
  setError(null);
  setCard(null);
  setSamples(null);
  setSamplesError(null);
  setAttachmentsDropped(false);
  samplesRequested.current = false;
  try {
    const r = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...next, attachments }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "解码失败");
    setInput(next);
    setCard(data);
    setAttachmentsDropped(!!data.attachmentsDropped);
    setDecodeStep(data.needMoreInfo ? 5 : 1);
    setView("decode");
  } catch (e) {
    setError(e instanceof Error ? e.message : "未知错误");
  } finally {
    setLoading(false);
  }
}
```

3) 给 `<DecodeView ... />` 传入 `attachmentsDropped={attachmentsDropped}`(在 `onNeedSamples={fetchSamples}` 同级)。

- [ ] **Step 4: 跑测试确认通过**

Run: `npm run test -- app/page.test.tsx`
Expected: PASS(原有 2 + 新增 1 = 3 个)。

- [ ] **Step 5: 全量验证**

Run: `npm run test && npx tsc --noEmit && npm run build`
Expected: 全部测试通过、tsc 无错误、构建成功。

- [ ] **Step 6: Commit**

```bash
git add app/page.tsx app/page.test.tsx app/components/DecodeView.tsx
git commit -m "feat: page 透传附件,降级时在解码视图提示附件未读取

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## 验收标准(对照 spec)

- [x] 文本/PDF/图片 → base64/text 经多模态块送进 Claude(Task 2/3/4)
- [x] 不引入解析库(纯 base64 + 模型多模态)(Task 2/4)
- [x] mediaType 白名单 + 体积上限校验(Task 1,前端 Task 4 / 服务端 Task 3)
- [x] 中转不支持多模态 → 去文档块重试一次 + `attachmentsDropped`(Task 3)
- [x] 降级提示在解码视图展示(Task 5)
- [x] 无附件回归与现状一致(Task 3/4/5 各含回归用例)

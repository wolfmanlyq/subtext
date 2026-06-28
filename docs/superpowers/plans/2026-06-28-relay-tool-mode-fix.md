# 中转 agent 行为适配(tool 模式)修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 修复 `/api/insight`(及 core/delivery/prototypes)500「两次输出均无效」——中转 `api.openai-next.com` 现在把 Messages API 请求塞进带 Bash 工具的 agent 环境,模型返回 `tool_use`/闲聊而非 JSON 文本。改用强制 tool_choice + 自定义 tool,从 `tool_use.input` 取结构化结果。

**Architecture:** 新增共享 `callStructured()`(lib/tool-call.ts):用 zod v4 原生 `z.toJSONSchema()` 把 Zod schema 转成 tool 的 input_schema,以 `tools:[tool] + tool_choice:{type:"tool",name}` 调模型,取返回中**唯一的 tool_use 块**(不按名匹配——中转会重命名 tool),用 Zod `.parse(block.input)` 校验。四个路由改调它,保留各自的「BadModelOutput 重试一次 + 友好错误 + 连接错不重试」结构与 core 的多模态降级。

**Tech Stack:** Next.js 16 / TS / @anthropic-ai/sdk / Zod v4.4.3(原生 z.toJSONSchema,无需新依赖)/ Vitest。

## Global Constraints

- 继续使用中转 `https://api.openai-next.com`(用户明确不切官方);wrangler/部署不动。
- 已探针验证的中转行为(必须据此实现):
  - 强制 `tool_choice:{type:"tool",name:X}` + 自定义 tool → 结果在 `tool_use.input`(insight 5s、core 嵌套 31s 均成功)。
  - **中转会重命名 tool**(发 `emit_insight` 回 `CompatEmitInsight39b185`)→ 适配器**取唯一 tool_use 块的 input,不匹配 name**。
  - assistant 预填 `{` 会 400(不可用)。
- `z.toJSONSchema(schema)` 产出 `{type:"object",properties,required,additionalProperties}` + 一个 `$schema` 顶层键 → 传给 Anthropic 前删掉 `$schema`。
- 保留现有重试语义:解析/校验失败 = `BadModelOutput`,重试一次;两次失败 = 友好 500;SDK 抛错(连接级)不重试。
- 测试 `npm test`;单文件 `npm test -- <path>`;tsc `TMPDIR="$PWD/.vitest-tmp" npx tsc --noEmit`;build `npm run build`。测试全程 mock,不打真中转。
- git `git -c user.email=wolfmanlyq@hotmail.com commit`。

## 文件结构

| 文件 | 职责 | 动作 |
|---|---|---|
| `lib/tool-call.ts` | `callStructured()` 共享适配器 | Create |
| `lib/tool-call.test.ts` | 适配器单测(取 tool_use.input、改名容忍、无 tool_use 抛错) | Create |
| `lib/prototype.ts` | 加 `PrototypeSchema`/`PrototypesSchema` | Modify |
| `app/api/insight/route.ts` | 改用 callStructured(InsightSchema) | Modify |
| `app/api/decode/core/route.ts` | 改用 callStructured(CoreSchema),保留多模态降级 | Modify |
| `app/api/decode/delivery/route.ts` | 改用 callStructured(DeliverySchema) | Modify |
| `app/api/prototypes/route.ts` | 改用 callStructured(PrototypesSchema) | Modify |
| 四个 `route.test.ts` | mock 改为返回 tool_use 块 | Modify |

---

## Task 1: callStructured 适配器

**Files:**
- Create: `lib/tool-call.ts`
- Test: `lib/tool-call.test.ts`

**Interfaces:**
- Produces:
  ```ts
  class BadModelOutput extends Error {}   // 导出,供路由复用
  function toInputSchema(schema: z.ZodType): Record<string, unknown>  // z.toJSONSchema 去掉 $schema
  async function callStructured<T>(args: {
    client: { messages: { create: Function } },
    model: string,
    maxTokens: number,
    system: string,
    content: string | unknown[],          // 文本或 content blocks(多模态)
    schema: import("zod").ZodType<T>,
    toolName: string,
    toolDescription: string,
  }): Promise<T>
  ```
  行为:构造 `tool = { name: toolName, description: toolDescription, input_schema: toInputSchema(schema) }`;`client.messages.create({ model, max_tokens, system, tools:[tool], tool_choice:{type:"tool",name:toolName}, messages:[{role:"user",content}] })`;从 `msg.content` 找**第一个 `type==="tool_use"` 的块**(不比较 name),`schema.parse(block.input)` 返回;找不到 tool_use 块、或 parse 失败 → 抛 `BadModelOutput`。SDK 抛错向上传播(连接级,不在此吞)。

- [ ] **Step 1: 写失败测试 `lib/tool-call.test.ts`**

```ts
import { test, expect, vi } from "vitest";
import { z } from "zod";
import { callStructured, toInputSchema, BadModelOutput } from "./tool-call";

const S = z.object({ keyInsight: z.string(), emotionIntensity: z.string() });

function clientReturning(content: unknown) {
  const create = vi.fn(async () => ({ content }));
  return { client: { messages: { create } }, create };
}

const base = {
  model: "claude-opus-4-8", maxTokens: 600, system: "sys", content: "user",
  schema: S, toolName: "emit_insight", toolDescription: "desc",
} as const;

test("toInputSchema 产出 object schema 且不含 $schema", () => {
  const js = toInputSchema(S);
  expect(js.type).toBe("object");
  expect((js as { properties?: unknown }).properties).toBeTruthy();
  expect((js as Record<string, unknown>)["$schema"]).toBeUndefined();
});

test("从 tool_use.input 取结构化结果", async () => {
  const { client, create } = clientReturning([
    { type: "tool_use", name: "emit_insight", input: { keyInsight: "k", emotionIntensity: "中高" } },
  ]);
  const out = await callStructured({ ...base, client });
  expect(out).toEqual({ keyInsight: "k", emotionIntensity: "中高" });
  // 发送了强制 tool_choice
  const arg = create.mock.calls[0][0];
  expect(arg.tool_choice).toEqual({ type: "tool", name: "emit_insight" });
  expect(arg.tools[0].input_schema.type).toBe("object");
});

test("中转重命名 tool 时仍能取(不按 name 匹配)", async () => {
  const { client } = clientReturning([
    { type: "thinking", thinking: "" },
    { type: "tool_use", name: "CompatEmitInsight39b185", input: { keyInsight: "k", emotionIntensity: "中" } },
  ]);
  const out = await callStructured({ ...base, client });
  expect(out.keyInsight).toBe("k");
});

test("没有 tool_use 块(只有闲聊文本)抛 BadModelOutput", async () => {
  const { client } = clientReturning([{ type: "text", text: "我需要确认一下……" }]);
  await expect(callStructured({ ...base, client })).rejects.toBeInstanceOf(BadModelOutput);
});

test("tool_use.input 不符合 schema 抛 BadModelOutput", async () => {
  const { client } = clientReturning([{ type: "tool_use", name: "x", input: { keyInsight: 123 } }]);
  await expect(callStructured({ ...base, client })).rejects.toBeInstanceOf(BadModelOutput);
});

test("SDK 连接错向上传播(不转成 BadModelOutput)", async () => {
  const create = vi.fn(async () => { throw new Error("boom"); });
  await expect(callStructured({ ...base, client: { messages: { create } } })).rejects.toThrow("boom");
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- lib/tool-call.test.ts`
Expected: FAIL —— 模块不存在。

- [ ] **Step 3: 实现 `lib/tool-call.ts`**

```ts
import { z } from "zod";

/** 模型返回了内容、但不是合法结构(无 tool_use 或 input 校验失败)—— 可重试。 */
export class BadModelOutput extends Error {}

/** Zod → Anthropic tool input_schema(去掉 z.toJSONSchema 注入的 $schema 顶层键)。 */
export function toInputSchema(schema: z.ZodType): Record<string, unknown> {
  const js = z.toJSONSchema(schema) as Record<string, unknown>;
  delete js["$schema"];
  return js;
}

interface CallArgs<T> {
  client: { messages: { create: (body: unknown) => Promise<{ content: unknown }> } };
  model: string;
  maxTokens: number;
  system: string;
  content: string | unknown[];
  schema: z.ZodType<T>;
  toolName: string;
  toolDescription: string;
}

/**
 * 以强制 tool_choice 调模型,从返回的(唯一)tool_use 块的 input 取结构化结果。
 * 中转会重命名 tool,故不按 name 匹配——取第一个 tool_use 块。
 */
export async function callStructured<T>(args: CallArgs<T>): Promise<T> {
  const tool = {
    name: args.toolName,
    description: args.toolDescription,
    input_schema: toInputSchema(args.schema),
  };
  const msg = await args.client.messages.create({
    model: args.model,
    max_tokens: args.maxTokens,
    system: args.system,
    tools: [tool],
    tool_choice: { type: "tool", name: args.toolName },
    messages: [{ role: "user", content: args.content }],
  });
  const blocks = (msg.content as Array<{ type: string; input?: unknown }>) ?? [];
  const toolUse = blocks.find((b) => b.type === "tool_use");
  if (!toolUse) throw new BadModelOutput("模型未返回 tool_use 结果");
  try {
    return args.schema.parse(toolUse.input);
  } catch {
    throw new BadModelOutput("tool_use 结果不符合预期结构");
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test -- lib/tool-call.test.ts`
Expected: PASS(6 用例)。

- [ ] **Step 5: 提交**

```bash
git add lib/tool-call.ts lib/tool-call.test.ts
git -c user.email=wolfmanlyq@hotmail.com commit -m "feat: callStructured 适配器(强制 tool_choice + 取 tool_use.input,容忍中转改名)"
```

---

## Task 2: prototypes Zod schema

**Files:**
- Modify: `lib/prototype.ts`
- Test: `lib/prototype.test.ts`(Create)

**Interfaces:**
- Produces: `PrototypeSchema`(zod,字段 name/strategy/sampleCopy/highlight/recommend/html 均 string)、`PrototypesSchema = z.object({ prototypes: z.array(PrototypeSchema) })`、`Prototype` 类型改为 `z.infer<typeof PrototypeSchema>`(保持字段不变)。

- [ ] **Step 1: 写失败测试 `lib/prototype.test.ts`**

```ts
import { test, expect } from "vitest";
import { PrototypeSchema, PrototypesSchema } from "./prototype";

test("PrototypeSchema 校验六个字符串字段", () => {
  const ok = { name: "A", strategy: "s", sampleCopy: "c", highlight: "h", recommend: "r", html: "<h1>x</h1>" };
  expect(PrototypeSchema.parse(ok).name).toBe("A");
  expect(PrototypeSchema.safeParse({ ...ok, html: 1 }).success).toBe(false);
});

test("PrototypesSchema 包一层 prototypes 数组", () => {
  const ok = { prototypes: [{ name: "A", strategy: "s", sampleCopy: "c", highlight: "h", recommend: "r", html: "<x/>" }] };
  expect(PrototypesSchema.parse(ok).prototypes).toHaveLength(1);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- lib/prototype.test.ts`
Expected: FAIL —— 未导出 schema。

- [ ] **Step 3: 改 `lib/prototype.ts`**

```ts
import { z } from "zod";

export const PrototypeSchema = z.object({
  name: z.string(),
  strategy: z.string(),
  sampleCopy: z.string(),
  highlight: z.string(),
  recommend: z.string(),
  html: z.string(),
});

export const PrototypesSchema = z.object({
  prototypes: z.array(PrototypeSchema),
});

export type Prototype = z.infer<typeof PrototypeSchema>;
```

- [ ] **Step 4: 运行确认通过 + 全量(确保 Prototype 类型改动不破坏 PrototypeGallery 等)**

Run: `npm test -- lib/prototype.test.ts`
Expected: PASS。
Run: `TMPDIR="$PWD/.vitest-tmp" npx tsc --noEmit`
Expected: 0 错误(`z.infer` 出的类型与原 interface 字段一致)。

- [ ] **Step 5: 提交**

```bash
git add lib/prototype.ts lib/prototype.test.ts
git -c user.email=wolfmanlyq@hotmail.com commit -m "feat: Prototype 加 Zod schema(PrototypeSchema/PrototypesSchema)"
```

---

## Task 3: insight 路由改 tool 模式

**Files:**
- Modify: `app/api/insight/route.ts`
- Test: `app/api/insight/route.test.ts`

**Interfaces:**
- Consumes: `callStructured`, `BadModelOutput`(Task 1);`InsightSchema`。

- [ ] **Step 1: 改写 `app/api/insight/route.test.ts`**

把 mock 从「返回 text 块」改为「返回 tool_use 块」。`fakeMessage` 改为:
```ts
function fakeToolMessage(input: unknown) {
  return { content: [{ type: "tool_use", name: "x", input }] };
}
```
现有用例改用它返回合法/非法 insight:
- 成功:`createMock.mockResolvedValue(fakeToolMessage({ keyInsight: "k", emotionIntensity: "中高" }))` → 200,json.keyInsight==="k"。
- 首次坏(无 tool_use)重试后成功:`mockResolvedValueOnce({ content:[{type:"text",text:"闲聊"}] })` 然后 `mockResolvedValueOnce(fakeToolMessage(...))` → 200,调用 2 次。
- 两次坏 → 友好 500(不暴露 Zod 原文),调用 2 次。
- 连接错(create throw)→ 500 含 boom,调用 1 次。
- 缺 feedback → 400。
- 断言发送了 `tool_choice`:`createMock.mock.calls[0][0].tool_choice.type === "tool"`。

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- app/api/insight/route.test.ts`
Expected: FAIL。

- [ ] **Step 3: 改 `app/api/insight/route.ts`**

删除本文件内的 `class BadModelOutput`、`callText`、`parse`(用 tool-call 的)。改为:
```ts
import { callStructured, BadModelOutput } from "@/lib/tool-call";
import { InsightSchema, type Insight } from "@/lib/insight";
```
`callText`/`parse` 两段替换为:
```ts
  async function getInsight(): Promise<Insight> {
    return callStructured({
      client: getClient(),
      model: MODEL,
      maxTokens: 600,
      system,
      content: user,
      schema: InsightSchema,
      toolName: "emit_insight",
      toolDescription: "返回客户反馈的言外之意 keyInsight 与情绪强度 emotionIntensity。",
    });
  }
```
重试结构改为调用 `getInsight()` 两次(第一次 BadModelOutput 则重试;两次 BadModelOutput → 友好 500;非 BadModelOutput → connErr)。友好文案不变:`"快速洞察失败:模型返回内容异常,请重试。"`。`connErr` 保留。

- [ ] **Step 4: 运行确认通过**

Run: `npm test -- app/api/insight/route.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add app/api/insight/route.ts app/api/insight/route.test.ts
git -c user.email=wolfmanlyq@hotmail.com commit -m "fix: insight 路由改 tool_choice 取 tool_use.input"
```

---

## Task 4: core 路由改 tool 模式(保留多模态降级)

**Files:**
- Modify: `app/api/decode/core/route.ts`
- Test: `app/api/decode/core/route.test.ts`

**Interfaces:**
- Consumes: `callStructured`, `BadModelOutput`;`CoreSchema`;`buildCorePrompt`/`buildCoreContent`(content blocks 仍兼容 tool 模式)。

- [ ] **Step 1: 改写 `app/api/decode/core/route.test.ts`**

mock 返回 tool_use 块(同 Task 3 的 `fakeToolMessage`,input 为合法 Core 对象 `validCore`)。保留全部现有用例语义,逐一改成 tool 形态:
- 无附件成功、首次坏重试成功、两次坏友好 500、连接错不重试、缺 feedback 400、超体积附件 400、背景字段透传(断言 `content` 文本含背景值——content 现在是 `messages[0].content`,仍是 string 或 blocks)。
- PDF 附件:断言传入 `messages[0].content` 含 document 块(buildCoreContent 仍产出 content blocks;tool 模式下 content blocks 照常发送)。
- 多模态失败降级:首次 create throw → 去多模态重试 → 成功且 `attachmentsDropped:true`,调用 2 次。
- 背景透传断言:从 `createMock.mock.calls[0][0].messages[0].content` 取文本(string 直接用;数组则 join 各 block.text)。

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- app/api/decode/core/route.test.ts`
Expected: FAIL。

- [ ] **Step 3: 改 `app/api/decode/core/route.ts`**

删除本文件 `class BadModelOutput`、`callModelText`、`parseCore`。引入 `callStructured, BadModelOutput`(from `@/lib/tool-call`)。新增内部函数:
```ts
  async function getCore(dropMultimodal: boolean): Promise<Core> {
    const content = attachments.length
      ? buildCoreContent(input, attachments, { dropMultimodal }).content
      : buildCorePrompt(input).user;
    const system = attachments.length
      ? buildCoreContent(input, attachments, { dropMultimodal }).system
      : buildCorePrompt(input).system;
    return callStructured({
      client: getClient(), model: MODEL, maxTokens: 12000,
      system, content, schema: CoreSchema,
      toolName: "emit_core",
      toolDescription: "返回客户反馈的结构化分析(needMoreInfo/realDemand/coreTension/foresight/evidence/questionsToConfirm)。",
    });
  }
```
(简化:可只调一次 `buildCoreContent`/`buildCorePrompt` 存到局部变量,避免重复构造。)
重试/降级结构保留:无附件路径 `getCore(false)` 两次(BadModelOutput 重试);有附件路径 `getCore(false)` 失败 → `getCore(true)` 并附 `attachmentsDropped:true`(任何首次错误都降级——沿用既有设计,已被用户裁定保留)。友好文案不变 `"分析失败:模型返回内容异常,请重试。"`。`connectionError` 保留。

- [ ] **Step 4: 运行确认通过**

Run: `npm test -- app/api/decode/core/route.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add app/api/decode/core/route.ts app/api/decode/core/route.test.ts
git -c user.email=wolfmanlyq@hotmail.com commit -m "fix: core 路由改 tool_choice 取 tool_use.input(保留多模态降级)"
```

---

## Task 5: delivery 路由改 tool 模式

**Files:**
- Modify: `app/api/decode/delivery/route.ts`
- Test: `app/api/decode/delivery/route.test.ts`

**Interfaces:**
- Consumes: `callStructured`, `BadModelOutput`;`DeliverySchema`;`buildDeliveryPrompt`。

- [ ] **Step 1: 改写 `app/api/decode/delivery/route.test.ts`**

mock 返回 tool_use 块(input 为合法 `validDelivery`)。保留用例:正常成功 + core 摘要进 prompt(断言 `messages[0].content` 含 core implicit 值)、缺 core 400(不调模型)、core 不合法 400、缺 feedback 400、首次坏重试成功、两次坏友好 500、连接错不重试。背景透传同 Task 2 既有用例改 tool 形态。

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- app/api/decode/delivery/route.test.ts`
Expected: FAIL。

- [ ] **Step 3: 改 `app/api/decode/delivery/route.ts`**

删除本文件 `class BadModelOutput`、`callText`、`parseDelivery`。引入 `callStructured, BadModelOutput`。新增:
```ts
  async function getDelivery(): Promise<Delivery> {
    const { system, user } = buildDeliveryPrompt(input, coreData);
    return callStructured({
      client: getClient(), model: MODEL, maxTokens: 4000,
      system, content: user, schema: DeliverySchema,
      toolName: "emit_delivery",
      toolDescription: "返回交付物(clientReply/checklist/nextActions)。",
    });
  }
```
(`coreData` = `parsedCore.data`,已在 Task 5 of 前一个特性提为 const。)重试结构调 `getDelivery()` 两次;友好文案不变 `"交付内容生成失败:模型返回内容异常,请重试。"`;`connectionError` 保留;缺/坏 core 仍先 400 且不调模型。

- [ ] **Step 4: 运行确认通过**

Run: `npm test -- app/api/decode/delivery/route.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add app/api/decode/delivery/route.ts app/api/decode/delivery/route.test.ts
git -c user.email=wolfmanlyq@hotmail.com commit -m "fix: delivery 路由改 tool_choice 取 tool_use.input"
```

---

## Task 6: prototypes 路由改 tool 模式 + 全量验证

**Files:**
- Modify: `app/api/prototypes/route.ts`
- Test: `app/api/prototypes/route.test.ts`

**Interfaces:**
- Consumes: `callStructured`, `BadModelOutput`;`PrototypesSchema`(Task 2);`buildPrototypePrompt`。

- [ ] **Step 1: 改写 `app/api/prototypes/route.test.ts`**

mock 返回 tool_use 块,input 为 `{ prototypes: [validPrototype] }`(validPrototype 六字段齐全)。保留用例:成功返回 prototypes 数组、缺 needSummary/rawFeedback 400、首次坏重试成功、两次坏友好 500、连接错不重试。

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- app/api/prototypes/route.test.ts`
Expected: FAIL。

- [ ] **Step 3: 改 `app/api/prototypes/route.ts`**

删除本文件 `class BadModelOutput`、`callText`、`parse`。引入 `callStructured, BadModelOutput`、`PrototypesSchema`。新增:
```ts
  async function getPrototypes() {
    return callStructured({
      client: getClient(), model: MODEL, maxTokens: 16000,
      system, content: user, schema: PrototypesSchema,
      toolName: "emit_prototypes",
      toolDescription: "返回 2-3 个方向小样(prototypes 数组,每个含 name/strategy/sampleCopy/highlight/recommend/html)。",
    });
  }
```
返回 `NextResponse.json(await getPrototypes())`(结构是 `{prototypes:[...]}`,前端 `data.prototypes` 不变)。重试结构两次;友好文案不变 `"生成小样失败:模型返回内容异常,请重试。"`;`connErr` 保留。

- [ ] **Step 4: 运行确认通过**

Run: `npm test -- app/api/prototypes/route.test.ts`
Expected: PASS。

- [ ] **Step 5: 全量验证**

Run: `npm test`
Expected: 全绿。
Run: `TMPDIR="$PWD/.vitest-tmp" npx tsc --noEmit`
Expected: 0 错误。
Run: `npm run build`
Expected: 成功,四个路由健在。

- [ ] **Step 6: 提交**

```bash
git add app/api/prototypes/route.ts app/api/prototypes/route.test.ts
git -c user.email=wolfmanlyq@hotmail.com commit -m "fix: prototypes 路由改 tool_choice 取 tool_use.input;全量验证"
```

---

## 验收清单

- [ ] 四路由均通过强制 tool_choice + 取 tool_use.input(不按 tool 名匹配,容忍中转改名)返回结构化结果。
- [ ] 重试一次 + 友好 500 + 连接错不重试 + core 多模态降级 语义保留。
- [ ] `npm test` 全绿、`tsc` 干净、`build` 成功。
- [ ] 中转端点/部署不变;前端 `data.prototypes`、三组并行编排不变。
- [ ] (人工/部署后)真实打 `/api/insight` 不再 500,返回 keyInsight/emotionIntensity。

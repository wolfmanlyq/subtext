# 解码分组并行加载 设计文档

**日期:** 2026-06-28
**目标:** 把"解码"从单个 `/api/analyze` 整卡调用,拆成多组独立调用,让每一步随对应组返回而逐步点亮,减少用户等待。

## 背景与现状

当前解码流程:

- `/api/insight`(已存在):快洞察,返回 `keyInsight` + `emotionIntensity`,Step1 言外之意秒回。
- `/api/analyze`(单调用):一次返回整张 7 步 `ActionCard`,用户必须等它整体返回才能看到 Step2-7。
- `/api/prototypes`(已存在):进入 Step6 时懒加载方向小样。

痛点:`/api/analyze` 是一次大调用(max_tokens 16000),返回慢;且它一失败就整体退回输入页。

约束(项目既有,不变):

- 继续使用中转端点 `https://api.openai-next.com`(不切官方端点)。中转不稳定、不支持多模态(确定性 400)、当前 key 额度可能耗尽 → 实时联调需有额度的 key。
- 模型 `claude-opus-4-8`;`@anthropic-ai/sdk` core Messages API + prompt 指定 JSON + `extractJson` + Zod 校验。
- 所有路由沿用 `BadModelOutput` 解析重试一次 + 友好错误 vs 连接错不重试 的既有模式。
- 多模态附件沿用现有 `buildAnalyzeContent` 的降级逻辑(去掉多模态块重试 + `attachmentsDropped`)。
- git 账号 `wolfmanlyq@hotmail.com`。

## 方案:分组并行(3 组)

7 个步骤映射到三组调用,按"相关性"合并:

| 组 | 端点 | 覆盖步骤 | 模型字段 |
|---|---|---|---|
| A 快洞察(已存在,不动) | `/api/insight` | Step1 言外之意 | `keyInsight`, `emotionIntensity` |
| B 分析主体(新) | `/api/decode/core` | Step2-5 | `needMoreInfo`, `realDemand`, `coreTension`, `foresight`, `evidence`, `questionsToConfirm` |
| C 交付(新) | `/api/decode/delivery` | Step6-7 | `clientReply`, `checklist`, `nextActions` |
| 小样(已存在,不动) | `/api/prototypes` | Step6 小样 | `prototypes[]` |

`/api/analyze` 删除——职责被 B + C 拆走。

### 分组理由

- B = "理解客户"(明话/纠结/预判/追问),逻辑连贯,一次产出最自然,且是用户最先翻、最想要的部分。
- C = "给客户交付"(话术/清单/谁动手),独立产物,可以晚一点到,不挡前面浏览。
- A 已存在且最快,Step1 体验不变。

### 发起时机:A、B 并发;C 串在 B 之后

- 点击解码 → 进解码页、原话(`input.feedback`)秒显 → **并发 A + B**。
- B 返回 → 填 Step2-5 →**接着发起 C**,C 的 prompt 带上 B 的分析结果(`realDemand` / `coreTension` 等),使话术/清单与分析连贯。
- C 返回 → 填 Step6-7。
- 小样仍在进入 Step6 时懒加载(不变)。

取舍:Step6/7 比 B 晚一个调用的时间到。但用户翻看前面 Step2-5 通常已给 C 足够时间返回,体验基本无感,换来话术与分析连贯。(此为用户明确选择:C 在 B 之后,优先连贯性。)

## 数据契约

### `lib/schema.ts`

新增两个子 schema,保留现有 `ActionCardSchema` 与 `ActionCard` 类型(供 DecodeView 字段读取与类型复用)。复用已有的 `RealDemandSchema` / `TensionSchema` / `NextActionSchema`。

```ts
export const CoreSchema = z.object({
  needMoreInfo: z.boolean(),
  realDemand: RealDemandSchema,
  coreTension: z.array(TensionSchema),
  foresight: z.array(z.string()),
  evidence: z.array(z.string()),
  questionsToConfirm: z.array(z.string()),
});
export type Core = z.infer<typeof CoreSchema>;

export const DeliverySchema = z.object({
  clientReply: z.string(),
  checklist: z.array(z.string()),
  nextActions: z.array(NextActionSchema),
});
export type Delivery = z.infer<typeof DeliverySchema>;
```

`emotionIntensity` / `keyInsight` 由 A 组(`Insight`)提供,B/C 不重复产出。

### `lib/prompts.ts`

- 新增 `buildCorePrompt(input)` —— 只产出 B 组字段的 JSON(从现有 `buildAnalyzePrompt` 抽取相关字段、规则、示例)。
- 新增 `buildCoreContent(input, attachments, { dropMultimodal })` —— B 组的多模态版本(沿用 `buildAnalyzeContent` 结构;附件只喂给 B,因为 B 负责"理解客户"最需要原始材料)。`AnalyzeContentBlock` 类型保留。
- 新增 `buildDeliveryPrompt(input, core)` —— 产出 C 组字段;在 user 段带入 `core` 的 `realDemand` / `coreTension` 摘要,使话术贴合分析。C 组不接收附件(基于 input + core 文本即可)。
- 删除 `buildAnalyzePrompt` / `buildAnalyzeContent`(或改造为上述函数)。`buildInsightPrompt` / `buildPrototypePrompt` 不变。

## 路由

### `app/api/decode/core/route.ts`(新)

- 复制 `analyze/route.ts` 的结构:body 校验、附件校验(`AttachmentsSchema` + `attachmentsWithinLimit`)、`callModelText(dropMultimodal)`、`parse` 用 `CoreSchema`、`BadModelOutput` 重试一次、无附件路径 / 有附件降级路径、`connectionError`。
- 友好错误:`"分析失败:模型返回内容异常,请重试。"`
- 成功返回 `Core`(降级时附 `attachmentsDropped: true`)。

### `app/api/decode/delivery/route.ts`(新)

- body:`{ ...input, core: Core }`。校验 `feedback` 非空、`core` 用 `CoreSchema.safeParse`(缺失/不合法返回 400)。
- `buildDeliveryPrompt(input, core)` → 单调用(无附件、无多模态)→ `DeliverySchema.parse` → `BadModelOutput` 重试一次 → 友好错误 `"交付内容生成失败:模型返回内容异常,请重试。"` → 连接错不重试。

### 删除 `app/api/analyze/route.ts`

## 前端编排 `app/page.tsx`

状态从单个 `card` / `decoding` 拆为分组(A 已有 `insight`):

```ts
const [core, setCore] = useState<Core | null>(null);
const [coreLoading, setCoreLoading] = useState(false);
const [coreError, setCoreError] = useState<string | null>(null);
const [delivery, setDelivery] = useState<Delivery | null>(null);
const [deliveryLoading, setDeliveryLoading] = useState(false);
const [deliveryError, setDeliveryError] = useState<string | null>(null);
```

`handleDecode(next, attachments)`:

1. 重置所有组状态、`setInput(next)`、`setDecodeStep(1)`、`setView("decode")`(原话秒显,不变)。
2. 并发发起 A(`/api/insight`,fire-and-forget,沿用现状)与 B(`/api/decode/core`,`setCoreLoading(true)`)。
3. B `.then`:`setCore(data)`、`setAttachmentsDropped(!!data.attachmentsDropped)`、`setDecodeStep(data.needMoreInfo ? 5 : 1)`,然后**发起 C**(`/api/decode/delivery`,body 带 `core`,`setDeliveryLoading(true)`);`.catch`:`setCoreError(...)`。
4. C `.then`:`setDelivery(data)`;`.catch`:`setDeliveryError(...)`。
5. 删除"await analyze、失败整体退回输入页"逻辑——改为各步内联错误。
6. `fetchSamples`:`needSummary` 改用 `insight.keyInsight` + `core.realDemand` + `core.coreTension`(不再依赖整卡 `card`);`samplesRequested` 守卫不变。

`needMoreInfo`(决定初始跳 Step5)在 B 返回后设置。

## DecodeView `app/components/DecodeView.tsx`

prop 从 `card: ActionCard | null` 改为接收:`insight`、`core: Core | null` + `coreLoading` + `coreError`、`delivery: Delivery | null` + `deliveryLoading` + `deliveryError`、以及现有 `samples` 系列、`attachmentsDropped`、`input`、回调。

各步读对应组:

- Step1:`insight`(`keyInsight` / `emotionIntensity`)+ 原话(不变)。
- Step2-5:读 `core.*`;`core` 未到且无 `coreError` 显示 `<Decoding/>`;`coreError` 显示 `⚠️ {coreError}`。
- Step6-7:读 `delivery.*`;同上,`delivery` 未到显示 `<Decoding/>`,`deliveryError` 显示错误。
- Step6 小样:`samples` / `samplesLoading` / `samplesError`(不变)。
- `onNeedSamples` 在 Step6 且 `core` 就绪时触发(`fetchSamples` 内部已有守卫)。

`needMoreInfo` 改读 `core?.needMoreInfo`(status-pill 与初始步)。

## 错误处理

- 每组失败 = 仅该组覆盖的步骤显示 `⚠️ 错误` + 提示重试,其余步骤照常工作。
- 彻底去掉"一处失败整体退回输入页"。
- A(快洞察)失败仍静默(B 是 Step1 之外的主数据源;Step1 的 insight 失败时回落到 `core` 无法覆盖 keyInsight——若 A 失败,Step1 显示原话 + 解码中直到无更多数据;这是可接受降级,因为 keyInsight 仅 A 产出)。

## 测试

`app/page.test.tsx` 现有按 `/api/analyze` 的 mock 改为 `/api/decode/core` + `/api/decode/delivery`:

1. 着陆→输入→解码:原话秒显(不变)。
2. A 先回 → Step1 言外之意先显示,B 未到(不变,改 mock URL)。
3. B 回 → 切到 Step2,明话(`realDemand.explicit`)出现。
4. B 回后 C 仍挂起 → 翻到 Step6 显示"解码中"。
5. C 回 → Step6 客户回复话术 / 清单出现。
6. B 失败 → Step2 显示错误;Step1(insight)、Step6(delivery)不受影响。
7. `attachmentsDropped`(来自 core)→ Step1 显示降级提示(改读 core)。
8. Step6 小样懒加载 + iframe(不变,`needSummary` 来源改为 insight+core)。

路由单测(参照现有 insight / prototypes 测试,若项目有路由级测试则补):

- `/api/decode/core`:坏输出重试一次后友好错误;连接错不重试。
- `/api/decode/delivery`:缺 `core` 返回 400;坏输出重试 + 友好错误。

## 验收标准

- 点击解码后:原话 0 延迟显示;言外之意(A)数秒内出现;Step2-5(B)随 core 返回点亮;Step6-7(C)随 delivery 返回点亮;小样进入 Step6 懒加载。
- 任一组失败只影响其步骤,不退回输入页。
- `tsc` 干净、全部测试通过、`next build` 成功。
- 中转端点与既有部署配置不变。

## 不做(YAGNI)

- 不做 6-7 个独立路由(成本/失败点过多)。
- 不做流式/SSE(改造面大,分组并行已满足"逐步点亮")。
- 不改 landing / input / workflow 视图、prototypes 逻辑、部署配置。

# prototype-4 完善 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 prototype-4 完善系统:可选「补充背景」(行业/品牌名/客户角色)真正参与解码、首页导航条、Step1 情绪药丸、Step8 彩蛋页、导出装饰按钮。

**Architecture:** 扩展 `AnalyzeInput` 三个可选字段,经一个共享 `contextLines()` 拼进三个 prompt builder 的 user 段(非空才拼),三个路由透传;UI 在 Landing/InputView/DecodeView 内部扩展,globals.css 补缺失类。不动三组并行架构、prototypes、历史抽屉、附件逻辑。

**Tech Stack:** Next.js 16 App Router (TS) / React 19 / @anthropic-ai/sdk / Zod / Vitest + @testing-library/react。

## Global Constraints

- 中转端点 `https://api.openai-next.com` 不变;wrangler/部署配置不动。
- 模型 `MODEL`(`claude-opus-4-8`);prompt 指定 JSON + `extractJson` + Zod。
- 三组并行架构(insight/core/delivery)、`/api/prototypes`、历史抽屉、附件多模态降级逻辑不改。
- 背景字段全可选:非空才进 prompt,**品牌名为空时绝不编造品牌**;缺失不触发 400;现有测试必须保持绿(向后兼容)。
- 测试 `npm test`(内部处理 `.vitest-tmp` TMPDIR);单文件 `npm test -- <path>`。
- 类型检查 `TMPDIR="$PWD/.vitest-tmp" npx tsc --noEmit`;构建 `npm run build`。
- git 提交 `git -c user.email=wolfmanlyq@hotmail.com commit`。
- `AnalyzeInput` 现有字段:`feedback, projectType, stage, audience, clientStyle`(均 string)。

## 文件结构

| 文件 | 职责 | 动作 |
|---|---|---|
| `lib/demo.ts` | AnalyzeInput 加 industry/brandName/clientRole 可选 | Modify |
| `lib/prompts.ts` | 共享 `contextLines()`;三 builder system+user 追加背景 | Modify |
| `lib/prompts.test.ts` | 背景字段拼接/不拼接用例 | Modify |
| `app/api/decode/core/route.ts` `delivery/route.ts` `insight/route.ts` | body→input 透传三字段 | Modify |
| `app/api/decode/core/route.test.ts` `delivery/route.test.ts` | 透传断言 | Modify |
| `app/components/Landing.tsx` | 顶部导航条 | Modify |
| `app/components/InputView.tsx` | 补充背景卡 + 三状态并入 onDecode | Modify |
| `app/components/InputView.test.tsx` | 背景字段用例 | Modify |
| `app/components/DecodeView.tsx` | 情绪药丸 + Step8 彩蛋 + 导出按钮 | Modify |
| `app/page.test.tsx` | Step8 / 情绪药丸 / Sign in 冒烟 | Modify |
| `app/globals.css` | 补缺失类 | Modify |

---

## Task 1: AnalyzeInput 扩展 + prompts 背景贯通

**Files:**
- Modify: `lib/demo.ts`
- Modify: `lib/prompts.ts`
- Test: `lib/prompts.test.ts`

**Interfaces:**
- Produces: `AnalyzeInput` 新增可选 `industry?`, `brandName?`, `clientRole?`(string)。`contextLines(input: AnalyzeInput): string` —— 返回拼好的可选背景段(每个非空字段一行,前置换行;全空返回 `""`)。三个 builder 的 user 段在原有字段后插入 `contextLines(input)`,system 段含「背景字段使用规则」。

- [ ] **Step 1: 在 `lib/prompts.test.ts` 末尾追加用例**

```ts
import { contextLines } from "./prompts";

const ctxInput: AnalyzeInput = {
  feedback: "再高级一点", projectType: "品牌海报", stage: "初稿反馈", audience: "设计", clientStyle: "",
  industry: "快消", brandName: "某连锁咖啡品牌", clientRole: "品牌经理",
};
const emptyCtx: AnalyzeInput = {
  feedback: "再高级一点", projectType: "品牌海报", stage: "初稿反馈", audience: "设计", clientStyle: "",
};

test("contextLines 非空字段才拼,全空返回空串", () => {
  const s = contextLines(ctxInput);
  expect(s).toContain("快消");
  expect(s).toContain("某连锁咖啡品牌");
  expect(s).toContain("品牌经理");
  expect(contextLines(emptyCtx)).toBe("");
});

test("三个 builder:有背景则 user 含之,system 含使用规则", () => {
  for (const built of [buildCorePrompt(ctxInput), buildDeliveryPrompt(ctxInput, sampleCore), buildInsightPrompt(ctxInput)]) {
    expect(built.user).toContain("某连锁咖啡品牌");
    expect(built.user).toContain("品牌经理");
    expect(built.system).toMatch(/背景|行业|品牌名|客户角色/);
  }
});

test("三个 builder:无背景则 user 不含背景字样、不编造品牌", () => {
  for (const built of [buildCorePrompt(emptyCtx), buildDeliveryPrompt(emptyCtx, sampleCore), buildInsightPrompt(emptyCtx)]) {
    expect(built.user).not.toContain("行业类型:");
    expect(built.user).not.toContain("品牌名称:");
    expect(built.user).not.toContain("客户角色:");
  }
});
```

(注:`sampleCore` 已在该测试文件中定义于现有 `buildDeliveryPrompt` 用例;若顺序在其之前,把这些用例放到文件末尾、`sampleCore` 定义之后。)

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- lib/prompts.test.ts`
Expected: FAIL —— `contextLines` 未导出 / user 不含背景。

- [ ] **Step 3: 改 `lib/demo.ts` 的 AnalyzeInput**

在接口末尾加三行:
```ts
export interface AnalyzeInput {
  feedback: string;
  projectType: string;
  stage: string;
  audience: string;
  clientStyle: string;
  industry?: string;
  brandName?: string;
  clientRole?: string;
}
```
`DEMO_INPUT` 不变(三项可选,不填合法)。

- [ ] **Step 4: 在 `lib/prompts.ts` 顶部(import 之后)加 `contextLines` 并导出**

```ts
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
- 品牌名称:有则让 clientReply 和方向小样话术更具体;没有则绝不编造品牌。
- 客户角色:用于判断真实关注点(品牌经理重调性/品牌安全感;产品负责人重卖点/说服力;老板重结果/确定性/少返工;市场部重传播效率;代理商重对上沟通;不确定则两条线并行)。`;
```

- [ ] **Step 5: 三个 builder 注入背景(system 末尾接 `CONTEXT_RULES`,user 接 `contextLines(input)`)**

`buildCorePrompt`:system 模板的反引号结束前加入 `${CONTEXT_RULES}`(放在「严格只输出 JSON…」之前);user 改为:
```ts
  const user = `客户反馈原文:
${input.feedback}

项目场景:${input.projectType}
当前阶段:${input.stage}
输出目标:${input.audience}
客户偏好/性格:${input.clientStyle || "(未提供)"}${contextLines(input)}

请解码这段反馈背后的言外之意,按系统要求输出 JSON。`;
```

`buildInsightPrompt`:同法,system 末尾(JSON 要求前)加 `${CONTEXT_RULES}`;user 在「当前阶段」行后接 `${contextLines(input)}`。

`buildDeliveryPrompt`:同法,system 末尾(JSON 要求前)加 `${CONTEXT_RULES}`;user 在「输出目标」行后接 `${contextLines(input)}`(保持 core 分析摘要段不变)。

- [ ] **Step 6: 运行测试确认通过**

Run: `npm test -- lib/prompts.test.ts`
Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add lib/demo.ts lib/prompts.ts lib/prompts.test.ts
git -c user.email=wolfmanlyq@hotmail.com commit -m "feat: AnalyzeInput 背景字段 + prompts 贯通(非空才拼)"
```

---

## Task 2: 三个路由透传背景字段

**Files:**
- Modify: `app/api/insight/route.ts`
- Modify: `app/api/decode/core/route.ts`
- Modify: `app/api/decode/delivery/route.ts`
- Test: `app/api/decode/core/route.test.ts`, `app/api/decode/delivery/route.test.ts`

**Interfaces:**
- Consumes: `AnalyzeInput`(Task 1)
- Produces: 三路由从 body 透传 `industry/brandName/clientRole` 进 `input`,可选缺失为 undefined。

- [ ] **Step 1: 在 core/delivery 测试文件各加透传用例**

`app/api/decode/core/route.test.ts` 末尾:
```ts
test("背景字段透传进模型 prompt", async () => {
  createMock.mockResolvedValue(fakeMessage(JSON.stringify(validCore)));
  await POST(req({ ...DEMO_INPUT, industry: "快消", brandName: "某咖啡品牌", clientRole: "老板" }));
  const sent = createMock.mock.calls[0][0].messages[0].content;
  const text = typeof sent === "string" ? sent : sent.map((b: { text?: string }) => b.text ?? "").join("");
  expect(text).toContain("快消");
  expect(text).toContain("某咖啡品牌");
  expect(text).toContain("老板");
});
```

`app/api/decode/delivery/route.test.ts` 末尾:
```ts
test("背景字段透传进模型 prompt", async () => {
  createMock.mockResolvedValue(fakeMessage(JSON.stringify(validDelivery)));
  await POST(req({ ...DEMO_INPUT, core, brandName: "某咖啡品牌", clientRole: "市场部" }));
  const sent = createMock.mock.calls[0][0].messages[0].content;
  expect(sent).toContain("某咖啡品牌");
  expect(sent).toContain("市场部");
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- app/api/decode/core/route.test.ts app/api/decode/delivery/route.test.ts`
Expected: FAIL —— 透传缺失,text 不含背景值。

- [ ] **Step 3: 三路由的 `input` 构造各加三字段**

每个文件里形如 `const input: AnalyzeInput = { feedback: body.feedback, projectType: body.projectType, stage: body.stage, audience: body.audience, clientStyle: body.clientStyle };` 的对象,追加:
```ts
    industry: body.industry,
    brandName: body.brandName,
    clientRole: body.clientRole,
```
并把 body 类型补上这三个可选字段(如 `AnalyzeInput & { attachments?: unknown }` 已经是 `AnalyzeInput` 派生则自动含可选字段;若 body 显式列字段,则补 `industry?: string; brandName?: string; clientRole?: string`)。delivery 路由的 body 仍含 `core`。insight 路由同法补三字段(insight 的 body 是 `AnalyzeInput`,加进 input 即可)。

- [ ] **Step 4: 运行确认通过**

Run: `npm test -- app/api/decode/core/route.test.ts app/api/decode/delivery/route.test.ts app/api/insight/route.test.ts`
Expected: PASS(含现有用例)。

- [ ] **Step 5: 提交**

```bash
git add app/api/insight/route.ts app/api/decode/core/route.ts app/api/decode/delivery/route.ts app/api/decode/core/route.test.ts app/api/decode/delivery/route.test.ts
git -c user.email=wolfmanlyq@hotmail.com commit -m "feat: 三路由透传背景字段进解码"
```

---

## Task 3: InputView 补充背景卡

**Files:**
- Modify: `app/components/InputView.tsx`
- Test: `app/components/InputView.test.tsx`

**Interfaces:**
- Consumes: `AnalyzeInput`(Task 1)
- Produces: `submit()` 传出的 input 含 `industry/brandName/clientRole`;UI 新增 `.context-card`。

- [ ] **Step 1: 在 `InputView.test.tsx` 末尾加用例**

```ts
test("填品牌名+选行业+选客户角色后,onDecode 收到三项背景;行业再点取消", async () => {
  const onDecode = vi.fn();
  render(<InputView loading={false} onBack={vi.fn()} onDecode={onDecode} />);
  await userEvent.type(screen.getByLabelText("品牌名称"), "某连锁咖啡品牌");
  await userEvent.click(screen.getByRole("button", { name: "快消" }));
  await userEvent.click(screen.getByRole("button", { name: "品牌经理" }));
  await userEvent.click(screen.getByRole("button", { name: /开始解码/ }));
  const input = onDecode.mock.calls[0][0];
  expect(input.brandName).toBe("某连锁咖啡品牌");
  expect(input.industry).toBe("快消");
  expect(input.clientRole).toBe("品牌经理");

  onDecode.mockClear();
  await userEvent.click(screen.getByRole("button", { name: "快消" })); // 再点取消
  await userEvent.click(screen.getByRole("button", { name: /开始解码/ }));
  expect(onDecode.mock.calls[0][0].industry).toBe("");
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- app/components/InputView.test.tsx`
Expected: FAIL —— 找不到「品牌名称」label / 「快消」按钮。

- [ ] **Step 3: 加常量与状态**

文件顶部常量区(`GOALS` 之后):
```ts
const INDUSTRIES = ["快消", "美妆", "3C", "汽车", "酒饮", "服饰", "文旅", "游戏", "金融", "其他"];
const CLIENT_ROLES = ["品牌经理", "市场部", "产品负责人", "老板", "代理商", "不确定"];
```
组件状态区(`notice` 之后):
```ts
  const [industry, setIndustry] = useState("");
  const [brandName, setBrandName] = useState("");
  const [clientRole, setClientRole] = useState("");
```
单选可取消 helper(组件内):
```ts
  function toggleSingle(cur: string, val: string, set: (v: string) => void) {
    set(cur === val ? "" : val);
  }
```

- [ ] **Step 4: submit() 并入三字段**

把 `onDecode({ feedback, projectType, stage, audience: goals.join(" / "), clientStyle: "" }, attachments)` 改为:
```ts
    onDecode(
      {
        feedback, projectType, stage, audience: goals.join(" / "), clientStyle: "",
        industry, brandName: brandName.trim(), clientRole,
      },
      attachments,
    );
```

- [ ] **Step 5: 在 `.chip-groups` 之后、`.input-actions` 之前插入背景卡 JSX**

```tsx
        <div className="context-card">
          <div className="context-head">
            <div>
              <div className="label">Optional Context</div>
              <h3>补充一点背景,让 Agent 更懂甲方</h3>
              <p>不填也能解码,补充一点背景,Agent 会少猜一点。</p>
            </div>
          </div>
          <div className="context-fields">
            <div className="context-field">
              <div className="chip-title">行业类型</div>
              <div className="chips">
                {INDUSTRIES.map((s) => (
                  <button
                    key={s}
                    className={`chip${industry === s ? " active" : ""}`}
                    onClick={() => toggleSingle(industry, s, setIndustry)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div className="context-field">
              <div className="chip-title">品牌名称</div>
              <input
                aria-label="品牌名称"
                className="brand-input"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                placeholder="例如:某连锁咖啡品牌 / 某 3C 品牌"
              />
            </div>
            <div className="context-field">
              <div className="chip-title">客户角色</div>
              <div className="chips">
                {CLIENT_ROLES.map((s) => (
                  <button
                    key={s}
                    className={`chip${clientRole === s ? " active" : ""}`}
                    onClick={() => toggleSingle(clientRole, s, setClientRole)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
```

- [ ] **Step 6: 运行确认通过**

Run: `npm test -- app/components/InputView.test.tsx`
Expected: PASS(含现有用例)。

- [ ] **Step 7: 提交**

```bash
git add app/components/InputView.tsx app/components/InputView.test.tsx
git -c user.email=wolfmanlyq@hotmail.com commit -m "feat: 输入页补充背景卡(行业/品牌名/客户角色)"
```

---

## Task 4: Landing 顶部导航条 + globals.css 补类

**Files:**
- Modify: `app/components/Landing.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `onStart`(已有 prop)
- Produces: Landing 渲染 `.landing-nav`;Sign in 按钮(`aria-label`/文本含「Sign in」)调 `onStart`。

- [ ] **Step 1: 改 `Landing.tsx`**

在 `<section className="view landing active">` 内、`.landing-inner` 前插入:
```tsx
      <header className="landing-nav" aria-label="产品导航">
        <div className="nav-brand">
          <div className="nav-mark">⌁</div>
          <div>
            <strong>言外之意 Subtext</strong>
            <span>Client Feedback Decoder</span>
          </div>
        </div>
        <div className="nav-actions">
          <span className="demo-pill">Demo Mode</span>
          <button className="nav-login" type="button" onClick={onStart}>
            Sign in / 进入工作台
          </button>
        </div>
      </header>
```

- [ ] **Step 2: 在 `app/globals.css` 末尾追加缺失类**

从 `subtext-prototype-4.html` 复制这些类的规则到 globals.css 末尾(逐字复制,不改既有类):`.landing-nav`、`.nav-brand`、`.nav-mark`、`.nav-brand strong`、`.nav-brand span`、`.nav-actions`、`.demo-pill`、`.nav-login`(含 :hover/:active)、`.context-card`、`.context-head`(含 h3/p)、`.context-fields`、`.context-field`(含 .chip-title/.chips/.chip/.chip.active)、`.brand-input`(含 ::placeholder/:focus)、`.emotion-card`、`.emotion-pill`(含 .calm/.thinking/.high 变体)、`.emotion-icon`、`.emotion-dot`、`.easter-panel`、`.easter-card`、`.easter-kicker`、`.easter-title`、`.easter-sub`、`.calm-strip`、`.knowledge-save`、`.knowledge-toast`(含 .show)。以及 prototype-4 媒体查询里 `.landing-nav`/`.demo-pill`/`.nav-brand span`/`.context-fields`/`.context-head` 的 `@media (max-width: 960px)` 规则。

(grep `subtext-prototype-4.html` 里对应选择器,整段拷贝;已存在于 globals.css 的类跳过。)

- [ ] **Step 3: 类型检查 + 构建验证(无新测试,验证不破坏)**

Run: `npm test -- app/page.test.tsx`
Expected: PASS(现有 page 冒烟仍绿;Sign in 在 Task 6 加断言)。

Run: `TMPDIR="$PWD/.vitest-tmp" npx tsc --noEmit`
Expected: 0 错误。

- [ ] **Step 4: 提交**

```bash
git add app/components/Landing.tsx app/globals.css
git -c user.email=wolfmanlyq@hotmail.com commit -m "feat: 首页顶部导航条 + globals.css 补 prototype-4 缺失类"
```

---

## Task 5: DecodeView 情绪药丸 + Step8 彩蛋 + 导出按钮

**Files:**
- Modify: `app/components/DecodeView.tsx`

**Interfaces:**
- Consumes: 现有 props(insight/core/delivery/...);无新 props。
- Produces: Step1 情绪渲染为 `.emotion-pill`;新增 step 8 彩蛋面板;Step7 主按钮「完成解码」→ `go(8)`;Step6 step-head 加导出装饰按钮。

- [ ] **Step 1: 加情绪强度→class 工具(组件文件内,组件外)**

```tsx
function emotionClass(e?: string): string {
  if (!e) return "alert";
  if (/[高强]/.test(e)) return "high";
  if (/中/.test(e)) return "thinking";
  if (/[低平淡]/.test(e)) return "calm";
  return "alert";
}
```

- [ ] **Step 2: Step1 情绪强度改药丸**

把 Step1 中情绪强度的 `mini-card metric`(现为 `<strong>情绪强度</strong><span>{e || "—"}</span>`)的 span 改为:
```tsx
                      <div className="mini-card metric emotion-card">
                        <strong>情绪强度</strong>
                        <span className={`emotion-pill ${emotionClass(e)}`}>
                          <i className="emotion-dot" />
                          <span className="emotion-icon">😐</span>
                          <span>{e || "—"}</span>
                        </span>
                      </div>
```
(保留「言外之意」那张 metric 卡不变。)

- [ ] **Step 3: go 上限提到 8**

`function go(n: number) { setStep(Math.max(1, Math.min(8, n))); }`

- [ ] **Step 4: Step7 主按钮改「完成解码」→ go(8)**

Step7 当前的「完成」按钮(调 `onDone`)改为:
```tsx
                <button className="btn-primary" onClick={() => go(8)}>
                  完成解码
                </button>
```
保留同区域的「重新输入」`onReset`。
(注:Step7 此前是 `step === 7` 的 `right-actions` 分支;保持「重新输入」按钮,仅把「完成」改为「完成解码」并指向 go(8)。)

- [ ] **Step 5: 加 Step8 彩蛋面板**

在 Step7 面板 JSX 之后、`step-actions` 公共区之前——按现有 DecodeView 结构,Step8 作为独立条件块渲染(与 step1-7 并列),且当 `step === 8` 时不渲染底部公共 step-actions(彩蛋页自带按钮)。实现:
```tsx
          {step === 8 && (
            <div className="easter-card">
              <div className="easter-kicker">MO SHENG QI · SHEN HU XI</div>
              <h2 className="easter-title">莫｜生｜气｜深｜呼｜吸</h2>
              <p className="easter-sub">
                甲方的话已经翻译完了,接下来按行动卡一步步来。不是你没听懂,是有些反馈本来就需要被翻译。
              </p>
              <div className="calm-strip">心态超好 小问题 小场面 超温柔 时刻谨记要微笑</div>
              <button
                className="btn-primary knowledge-save"
                type="button"
                onClick={(e) => {
                  const btn = e.currentTarget;
                  btn.textContent = "已存入";
                  setSaved(true);
                  setTimeout(() => { btn.textContent = "⌁ 存入知识库"; }, 1400);
                }}
              >
                ⌁ 存入知识库
              </button>
              <div className={`knowledge-toast${saved ? " show" : ""}`} aria-live="polite">
                已存入知识库,下次更懂这位甲方。
              </div>
              <div className="step-actions" style={{ width: "100%", marginTop: 4 }}>
                <button className="btn-ghost" onClick={() => go(7)}>返回行动卡</button>
                <button className="btn-ghost" onClick={onDone}>回到首页</button>
              </div>
            </div>
          )}
```
配套状态:组件顶部加 `const [saved, setSaved] = useState(false);`。
并把 `easter-panel` class 加到 step8 的 `step-panel`:面板外层 `className` 里,当 `step === 8` 时附加 `" easter-panel"`(与现有 `final-panel`(step6)同法,用模板串拼)。

- [ ] **Step 6: Step8 不渲染公共 step-actions**

底部公共 `<div className="step-actions">…</div>` 用条件包裹:`{step !== 8 && ( …现有 step-actions… )}`(彩蛋页自带按钮)。

- [ ] **Step 7: Step6 加导出装饰按钮**

Step6 的 step-head 区(`<span className="status-pill">` 处)替换为带导出按钮的 right-actions:
```tsx
            <div className="right-actions">
              <span className="status-pill">…现有 pill 文案…</span>
              <button
                className="btn-ghost"
                type="button"
                onClick={(e) => {
                  const b = e.currentTarget;
                  b.textContent = "Exported";
                  setTimeout(() => { b.textContent = "导出行动卡 / Export Action Card"; }, 1200);
                }}
              >
                导出行动卡 / Export Action Card
              </button>
            </div>
```
(若 Step6 head 现用统一 `step-head` 结构,则只在 Step6 分支额外渲染该 right-actions;不影响其他步骤。保持 status-pill 既有逻辑。)

- [ ] **Step 8: 验证(page 测试 + tsc)**

Run: `npm test -- app/page.test.tsx`
Expected: 现有用例仍绿(Step8 断言在 Task 6 加)。

Run: `TMPDIR="$PWD/.vitest-tmp" npx tsc --noEmit`
Expected: 0 错误。

- [ ] **Step 9: 提交**

```bash
git add app/components/DecodeView.tsx
git -c user.email=wolfmanlyq@hotmail.com commit -m "feat: Step1 情绪药丸 + Step8 彩蛋页 + Step6 导出装饰按钮"
```

---

## Task 6: page 测试补充 + 全量验证

**Files:**
- Modify: `app/page.test.tsx`

**Interfaces:**
- Consumes: Landing Sign in(Task 4)、DecodeView Step8 / 情绪药丸(Task 5)

- [ ] **Step 1: 在 `app/page.test.tsx` 加用例**

```tsx
test("首页 Sign in 进入输入页", async () => {
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
  render(<Page />);
  await userEvent.click(screen.getByRole("button", { name: /Sign in/ }));
  expect(screen.getByText("甲方爸爸的话")).toBeInTheDocument();
});

test("Step1 渲染情绪药丸;Step7 完成解码进 Step8 彩蛋,回到首页回 workflow", async () => {
  vi.stubGlobal("fetch", routeFetch({
    "/api/insight": insight, "/api/decode/core": core, "/api/decode/delivery": delivery, "/api/prototypes": samples,
  }));
  render(<Page />);
  await userEvent.click(screen.getByRole("button", { name: /Start Now/ }));
  await userEvent.click(screen.getByRole("button", { name: /开始解码/ }));
  await waitFor(() => expect(document.querySelector(".emotion-pill")).not.toBeNull());

  await userEvent.click(screen.getByRole("button", { name: /开工/ })); // 到 Step7
  await userEvent.click(screen.getByRole("button", { name: "完成解码" }));
  await waitFor(() => expect(screen.getByText(/莫｜生｜气/)).toBeInTheDocument());
  await userEvent.click(screen.getByRole("button", { name: "回到首页" }));
  await waitFor(() => expect(screen.getByText("解码工作台")).toBeInTheDocument());
});
```
(`insight/core/delivery/samples/routeFetch` 已在该文件定义。「解码工作台」是 WorkflowHome 标题,确认其文案;若不同,改成 WorkflowHome 实际标题文案。)

- [ ] **Step 2: 运行确认通过**

Run: `npm test -- app/page.test.tsx`
Expected: PASS。

- [ ] **Step 3: 全量测试**

Run: `npm test`
Expected: 全绿。

- [ ] **Step 4: 类型检查**

Run: `TMPDIR="$PWD/.vitest-tmp" npx tsc --noEmit`
Expected: 0 错误。

- [ ] **Step 5: 构建**

Run: `npm run build`
Expected: 成功。

- [ ] **Step 6: 提交**

```bash
git add app/page.test.tsx
git -c user.email=wolfmanlyq@hotmail.com commit -m "test: 补 Sign in / 情绪药丸 / Step8 彩蛋 用例并全量验证"
```

---

## 验收清单(全部完成后)

- [ ] 背景三项填了→prompt 含、影响解码;不填→不含、不报错;现有测试全绿(向后兼容)。
- [ ] 首页导航条、输入页背景卡、Step1 情绪药丸、Step8 彩蛋、Step6 导出按钮按 prototype 呈现。
- [ ] `npm test` 全绿、`tsc --noEmit` 干净、`npm run build` 成功。
- [ ] 中转端点、部署、prototypes/历史抽屉/附件/三组并行架构不变。

# prototype-4 完善 设计文档

**日期:** 2026-06-28
**目标:** 按 `subtext-prototype-4.html` 完善系统:输入页新增可选「补充背景」(行业/品牌名/客户角色)并真正参与解码、首页顶部导航条、Step1 情绪药丸、Step8 彩蛋页、导出/下载装饰按钮。

## 背景与现状

现有 app 已实现 prototype 1-3 的视觉(湖光山色主题、绿色步骤导航、玻璃卡)与解码三组并行架构(`/api/insight` + `/api/decode/core` + `/api/decode/delivery` + 懒加载 `/api/prototypes`)。本次只做 prototype-4 相对现状的增量:

| 区块 | 现状 | prototype-4 增量 |
|---|---|---|
| AnalyzeInput | feedback/projectType/stage/audience/clientStyle | + industry / brandName / clientRole(可选) |
| 三个 prompt builder | 已拼前 5 字段 | 追加三项背景(非空才拼,空不出现) |
| 三个路由 body | 取 5 字段 | 透传三项背景(可选,不传不报错) |
| Landing | 仅 brand-logo + slogan + Start | + 顶部导航条(品牌标 / Demo Mode / Sign in) |
| InputView | 三组 chips + 历史抽屉 | + 「补充背景」卡(行业 chips / 品牌名输入框 / 客户角色 chips) |
| DecodeView Step1 | 情绪强度纯文本 | 情绪药丸(圆点+表情+文字,按强度变色) |
| DecodeView | 7 步 | + Step8 彩蛋页(莫生气深呼吸 + 存入知识库 toast) |
| Step6/小样 | 无装饰按钮 | + 导出行动卡 / 下载小样(纯前端反馈) |

## 约束(项目既有,不变)

- 继续使用中转端点 `https://api.openai-next.com`,不切官方端点;wrangler/部署配置不动。
- 模型 `claude-opus-4-8`;core Messages API + prompt 指定 JSON + `extractJson` + Zod。
- 三组并行架构、`/api/prototypes`、历史抽屉、附件多模态降级逻辑不改。
- 测试:Vitest + testing-library,全程 mock。命令 `npm test`(内部处理 `.vitest-tmp` TMPDIR)。
- 类型检查 `TMPDIR="$PWD/.vitest-tmp" npx tsc --noEmit`;构建 `npm run build`。
- git 账号 `wolfmanlyq@hotmail.com`。

## 数据契约

### `lib/demo.ts` — 扩展 AnalyzeInput

```ts
export interface AnalyzeInput {
  feedback: string;
  projectType: string;
  stage: string;
  audience: string;
  clientStyle: string;
  industry?: string;     // 行业类型(空字符串/undefined = 未填)
  brandName?: string;    // 品牌名称
  clientRole?: string;   // 客户角色
}
```

向后兼容:三项可选,现有调用(只传前 5 个)仍合法。

### `lib/prompts.ts` — 三个 builder 追加背景

`buildInsightPrompt`、`buildCorePrompt`、`buildDeliveryPrompt` 各自:

1. **system 段**追加「背景字段使用规则」(照 prototype 范本):
   - 行业类型:影响常见卖点、表达方式、周全性检查点。
   - 品牌名称:有则让 clientReply 和方向小样话术更具体;**没有则绝不编造品牌**。
   - 客户角色:用于判断真实关注点(品牌经理重调性/安全感;产品负责人重卖点;老板重结果/少返工;市场部重传播效率;代理商重对上沟通;不确定则两条线并行)。
   - 这些字段可为空,不能因为没填就拒绝输出。

2. **user 段**:在已有字段后,**仅当对应字段非空才追加**一行,例如:
   ```
   行业类型:快消
   品牌名称:某连锁咖啡品牌
   客户角色:品牌经理
   ```
   空字段不输出该行(避免噪声、避免暗示编造)。

用一个内部小工具组装(如 `contextLines(input)` 返回拼好的可选段落字符串),三个 builder 复用,保持 DRY。

### 路由 — 透传背景字段

`/api/insight`、`/api/decode/core`、`/api/decode/delivery` 的 body→input 构造各加三行:
```ts
industry: body.industry,
brandName: body.brandName,
clientRole: body.clientRole,
```
均可选,缺失为 `undefined`,不触发 400。其余校验/重试/降级逻辑不变。

## UI 组件

### `app/components/Landing.tsx` — 顶部导航条

在 `.landing` 内、`.landing-inner` 前加 `<header className="landing-nav">`:
- `.nav-brand`:`.nav-mark`(⌁)+ strong「言外之意 Subtext」+ span「Client Feedback Decoder」
- `.nav-actions`:`.demo-pill`「Demo Mode」+ `.nav-login` 按钮「Sign in / 进入工作台」
- Start 按钮与 Sign in 按钮都调用 `onStart`(进输入页)。

### `app/globals.css` — 补缺失类

从 prototype-4 复制缺失的样式块:`.landing-nav / .nav-brand / .nav-mark / .nav-actions / .demo-pill / .nav-login`、`.context-card / .context-head / .context-fields / .context-field`、`.brand-input`、`.emotion-pill / .emotion-icon / .emotion-dot`(及 calm/thinking/high/alert 变体)、`.easter-panel / .easter-card / .easter-kicker / .easter-title / .easter-sub / .calm-strip / .knowledge-save / .knowledge-toast`、`.download-sample`(若缺)。仅追加缺失类,不改既有类。

### `app/components/InputView.tsx` — 补充背景卡

在 `.chip-groups` 之后、`.input-actions` 之前加 `.context-card`:
- **行业类型** `.context-field`(data-group industry):10 chips(快消/美妆/3C/汽车/酒饮/服饰/文旅/游戏/金融/其他)。单选可取消(再点取消,空=未填)。状态 `const [industry, setIndustry] = useState("")`。
- **品牌名称** `.context-field`:`.brand-input` 输入框。状态 `const [brandName, setBrandName] = useState("")`。
- **客户角色** `.context-field`(data-group clientRole):6 chips(品牌经理/市场部/产品负责人/老板/代理商/不确定)。单选可取消。状态 `const [clientRole, setClientRole] = useState("")`。
- `submit()` 把三项并入 onDecode 的 input:`industry, brandName: brandName.trim(), clientRole`。
- 现有场景/阶段/目标 chips、历史抽屉、附件、限额提示全部保留。

单选可取消的 chip 用一个小 helper:点击已选项→清空,否则设为该值。

### `app/components/DecodeView.tsx`

**Step1 情绪药丸**:把现 `<span>{e || "—"}</span>` 改为 `.emotion-pill`:
```tsx
<span className={`emotion-pill ${emotionClass(e)}`}>
  <i className="emotion-dot" />
  <span className="emotion-icon">😐</span>
  <span>{e || "—"}</span>
</span>
```
`emotionClass(e)`:含「高/强」→`high`,含「中」→`thinking`,含「低/平/淡」→`calm`,否则 `alert`。文字直接用模型返回的 `insight.emotionIntensity`。

**Step8 彩蛋页**:
- STEPS 仍是 7 项导航(Step8 不进导航条)。
- 新增 `step === 8` 分支渲染 `.easter-panel`(kicker / title「莫｜生｜气…」/ sub / calm-strip / 「⌁ 存入知识库」按钮 + toast / 「返回行动卡」回 Step7 + 「回到首页」`onDone`)。
- `go(n)` 上限从 7 提到 8。
- Step7 主按钮文案改「完成解码」,点击 `go(8)` 进彩蛋(替换原 `onDone`)。原 Step7 的「重新输入」`onReset` 保留。
- 「存入知识库」按钮:点击→按钮文字「已存入」+ toast `.show`,1.4s 后按钮文字回退(纯前端,不持久化)。
- 进度条:Step8 时 `(8-1)/6` 会超 100%,用 `Math.min(..., 86%)` 钳位(prototype 已这么做);或 Step8 按 Step7 进度显示。采用钳位到 86%。

**装饰按钮**:
- Step6 step-head 加「导出行动卡 / Export Action Card」按钮:点击→「Exported」1.2s 回退。
- 小样卡若由 PrototypeGallery 渲染,则在 gallery 内或卡片上加「下载小样」按钮:点击→「已生成」1.2s 回退。(若 PrototypeGallery 结构不便,装饰按钮仅加在 Step6 导出处;下载小样作为可选,以不破坏现有小样渲染为准。)

### `app/page.tsx`

Step8 经由 DecodeView 内部步骤切换实现,page 的 `onDone`(→ workflow)语义不变(Step8「回到首页」调用它)。无需改 page 的 fetch/状态;仅确认 DecodeView 新增 props 不破坏调用(本次不加 page→DecodeView 新 props,Step8 与装饰按钮均在 DecodeView 内部状态完成)。

## 错误处理

背景字段全可选,空值不进 prompt、不报错。其余沿用现有三组独立 loading/error。装饰按钮无网络副作用。

## 测试

- `lib/prompts.test.ts`:三个 builder 传 industry/brandName/clientRole 时 user 段含之;不传时**不含**这些字样(尤其不含编造品牌)。system 段含「背景字段使用规则」关键词。
- `app/api/decode/core/route.test.ts` / `delivery/route.test.ts`:body 带背景字段→透传进模型 prompt(断言 sent content 含值);不带→正常 200。
- `app/components/InputView.test.tsx`:填品牌名 + 选行业 + 选客户角色→`onDecode` 收到的 input 含三项;行业/角色再点取消→变空串;现有用例(场景/阶段/目标、附件限额)保持绿。
- `app/page.test.tsx`:Step7 点「完成解码」→ 出现「莫生气」彩蛋文案;Step8 点「回到首页」→ 回 workflow;Step1 渲染出 `.emotion-pill`。其余分组加载用例保持绿。
- Landing 导航:page 冒烟用例点 Sign in → 进输入页。

## 验收标准

- 三项背景填了即影响解码(prompt 含)、不填不影响(向后兼容,现有测试全绿)。
- 首页导航条、输入页背景卡、Step1 情绪药丸、Step8 彩蛋、装饰按钮按 prototype 呈现。
- `npm test` 全绿、`tsc --noEmit` 干净、`npm run build` 成功。
- 中转端点、部署、prototypes/历史抽屉/附件/三组并行架构不变。

## 不做(YAGNI)

- 「存入知识库」「导出/下载」不接真实持久化/文件(纯前端反馈)。
- 不引入真实登录(Sign in = 进输入页)。
- 不改解码三组并行架构。
- 不动 WorkflowHome 现有结构(prototype 的 workflow 卡片现状已覆盖)。

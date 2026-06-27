# 言外之意 Subtext — 设计文档

> Client Feedback to Action Agent · 48h 黑客松 MVP
> 日期:2026-06-27 · 状态:已通过设计评审,待写实现计划

## 1. 项目定位

面向广告营销团队的客户反馈工作流 Agent。把模糊、感受型、非结构化的客户反馈
(如"再高级一点""不要太硬广")转化为可执行的「甲方反馈行动卡」,帮助团队减少理解
偏差、降低返工成本、提高下一轮方案通过率。

核心链路:**混乱反馈 → 需求萃取 → 风险识别 → 分岗位执行 → 客户回复话术 → 方向小样确认**

杀手锏:为同一需求当场生成 2-3 个视觉迥异、真实可点击的网页原型,在页面内并排渲染,
让甲方"点一个 + 吐一句槽"来确认方向。

## 2. 关键技术决策(已确认)

| 维度 | 决策 |
|------|------|
| 大模型 | Claude API,模型 `claude-opus-4-8`,官方 Anthropic SDK |
| 技术栈 | Next.js (App Router, TypeScript) 全栈 |
| Agent 架构 | 两步结构化调用(非真多 Agent 派发) |
| 持久化 | 无数据库(MVP 不持久化真实数据) |
| 原型渲染 | `<iframe sandbox srcDoc={...}>`,隔离且可点击 |

## 3. 整体架构

```
Next.js (App Router, TypeScript)

浏览器端 (Client Components)
  输入区(主框 + 4 标签) ──提交──▶ /api/analyze   (Step 1: 结构化需求卡)
  结果卡片区 + 原型并排   ◀──流式── /api/prototypes (Step 2: 2-3 HTML 原型)
        │                              │
   iframe sandbox 渲染            Anthropic SDK (claude-opus-4-8)
```

- 纯前端 + Next API Routes,无数据库。
- 两个 API 路由对应两步调用;前端先拿需求卡立即渲染,再异步/流式取原型,避免一次等太久。
- HTML 原型用 `<iframe sandbox srcDoc>` 渲染:天然隔离、可点击、不污染主页面样式。

## 4. 数据流(核心链路)

```
用户粘贴反馈 + 选 4 个标签
  ▼
[Step 1] POST /api/analyze
   → Claude 结构化输出(JSON Schema 约束)
   → 需求卡(9 字段) + 方案修改清单 + 客户回复话术
   → 信息不足时返回 needMoreInfo + 追问问题列表(不强行出结论)
  ▼
前端渲染「甲方反馈行动卡」三大块
  ▼
[Step 2] POST /api/prototypes (带 Step1 需求摘要)
   → 2-3 个方向(轻度调整 / 策略强化 / 创意升级)
   → 每方向:一句话策略 + 完整 HTML + 适配反馈 + 风险 + 推荐优先级
  ▼
前端并排 iframe 渲染 → 用户点选 + 吐槽
  ▼
[可选·杀手锏] 从「选了哪个 + 吐了什么槽」反推真实偏好(再调一次 Claude)
```

## 5. 页面与组件

- `app/page.tsx` — 单页应用,三段式纵向布局:输入区 → 行动卡区 → 小样区。
- `InputPanel` — 主输入框 + 4 个轻量标签下拉(项目类型 / 当前阶段 / 输出对象 / 客户偏好)。
  带"用示例填充"(白桃冰美式 demo)。
- `ActionCard` — 渲染 Step1 结果:`需求卡`(9 字段,优先级红/黄/绿标)、`修改清单`、
  `回复话术`(一键复制)。
- `PrototypeGallery` — 并排 2-3 个 `PrototypeFrame`(iframe sandbox),
  每个下方有"选它"按钮 + 吐槽输入框。
- `PreferenceInsight`(可选)— 反推偏好结论卡。
- `lib/anthropic.ts` — SDK 客户端封装。
- `lib/prompts.ts` — 两步的 system/user prompt。
- `lib/schema.ts` — 需求卡 JSON Schema 与 TS 类型。

## 6. 两次 Claude 调用契约

### Step 1 — 需求萃取(结构化输出)

- 模型 `claude-opus-4-8`,`thinking: {type:"adaptive"}`,`output_config.format` 用 JSON Schema 强约束。
- 输出字段:
  - `oneLineTranslation` — 一句话翻译
  - `explicitNeeds[]` — 显性需求
  - `implicitNeeds[]` — 隐性诉求
  - `coreConflict` — 核心矛盾
  - `feedbackTypes[]` — 反馈类型(品牌露出/创意调性/达人策略/预算逻辑/平台风险/内容传播力 等)
  - `items[]` — 修改项,每条含 `desc` / `priority`(必须改/建议优化/需确认)/ `roles[]`(涉及岗位)/ `risk`
  - `questionsToAsk[]` — 需要反问客户的问题
  - `replyScript` — 客户回复话术
  - `needMoreInfo` (bool) — 信息不足标记
- 信息不足时 `needMoreInfo=true` + `questionsToAsk` 引导补充,不硬出结论。

### Step 2 — 方向小样(流式)

- 输入:Step1 需求摘要 + 原始反馈;用 streaming,`max_tokens` 给足避免超时。
- 输出 2-3 个方向,每个含:
  - `strategy` — 一句话策略
  - `html` — 自包含可点击 HTML(内联 CSS,无外链)
  - `solvesFeedback` — 适配哪类反馈
  - `risk` — 可能风险
  - `priority` — 推荐优先级
- 小样类型:轻度调整版 / 策略强化版 / 创意升级版。

## 7. 错误处理与边界

- Claude 调用包 try/catch,区分 `RateLimitError` / `APIStatusError` / 网络错误,前端给可读提示 + 重试按钮。
- 结构化输出校验失败 → 提示重试(不静默吞错)。
- 空输入 / 反馈过短 → 前端拦截或走 `needMoreInfo` 追问。
- API Key 从环境变量 `ANTHROPIC_API_KEY` 读(`.env.local`),不入库、不下发前端。
- iframe 加 `sandbox` 属性,限制脚本能力,防生成的 HTML 干扰主应用。

## 8. 48h MVP 范围

**做:**
- 一键粘贴混乱反馈 + 4 个轻量标签
- 需求卡(9 字段)
- 方案修改清单
- 客户回复话术(一键复制)
- 2-3 个可点击 HTML 方向小样(并排渲染)
- 卡片式页面 + 白桃冰美式示例一键填充

**先不做(stretch):**
- 偏好反推闭环(选择 + 吐槽 → 真实偏好)
- 五层需求图
- 风险红旗清单可视化
- 客户偏好库持久化
- 企业微信 / 飞书接入

## 9. 测试要点

- Step1 结构化输出在示例反馈(白桃冰美式)下字段完整、优先级合理。
- Step2 生成的 HTML 在 iframe 中可正常渲染、可点击、三个方向视觉有区分度。
- 信息不足分支:输入过短时走 `needMoreInfo` 追问而非硬出结论。
- 错误分支:无 API Key / 限流 / 网络错误时前端有可读提示。

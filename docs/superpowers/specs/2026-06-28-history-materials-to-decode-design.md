# 历史材料喂给解码 — 设计文档

> 让"历史材料"抽屉真正把文件内容(文本/PDF/图片)送进 Claude 解码,而非仅追加文件名。
> 日期:2026-06-28 · 状态:已通过设计评审,待写实现计划

## 1. 背景与目标

当前 `InputView` 的历史材料抽屉是纯前端演示:选中的文件只把**文件名**追加进反馈文本。
本设计让选中的文件**内容**真正参与解码。

已确认的关键决策:
- **文件类型**:文本(.txt/.md 等)+ PDF + 图片。
- **多模态来源**:走 Claude 多模态文档块(base64),不引入服务端解析库(Cloudflare Workers 友好)。
- **线上端点**:仍用第三方中转 `api.openai-next.com`(可能不支持多模态)。
- **降级**:中转不支持多模态时,自动去掉文档/图片块重试一次(仅文本+文件名),结果仍能产出,并提示"附件未被读取"。

## 2. 数据流

```
浏览器(InputView 抽屉)
  上传文件 → FileReader:
    文本(.txt/.md…) → readAsText  → {kind:"text", data: 文本}
    PDF             → readAsDataURL → {kind:"pdf",  mediaType:"application/pdf", data: base64}
    图片            → readAsDataURL → {kind:"image", mediaType:"image/png|jpeg|webp", data: base64}
  选中的文件 → attachments[] 随 onDecode 传出
  体积保护:单文件 > 4MB 或总量 > 8MB → 前端拦截提示
        │  POST /api/analyze  body = AnalyzeInput & { attachments?: Attachment[] }
        ▼
/api/analyze
  Zod 校验 attachments(kind 枚举 / mediaType 白名单 / 大小);非法或过大 → 400
  buildAnalyzeContent(input, attachments) 拼出 user 消息 content 块:
    文本附件 → 并进 user 文本,标注「参考材料:<文件名>」
    PDF      → {type:"document", source:{type:"base64", media_type:"application/pdf", data}}
    图片     → {type:"image",    source:{type:"base64", media_type, data}}
  调 Claude messages.create
    成功 → 解析 JSON,返回 card
    catch 且 attachments 非空 → 去掉 document/image 块,仅文本+文件名重试一次
        重试成功 → 返回 card + { attachmentsDropped: true }
        仍失败  → 500
        ▼
前端
  attachmentsDropped=true → 结果区提示「附件未被模型读取(当前端点不支持),已仅按文本解码」
```

## 3. 组件与文件

| 文件 | 改动 |
|------|------|
| `lib/attachment.ts`(新) | `Attachment` 类型 + `AttachmentSchema`(Zod);`AttachmentKind` 枚举;mediaType 白名单;大小常量(`MAX_FILE_BYTES=4MB`、`MAX_TOTAL_BYTES=8MB`) |
| `lib/prompts.ts` | 新增 `buildAnalyzeContent(input, attachments)`:纯函数,返回 `{ system, content }`,`content` 为 Anthropic content 块数组。保留 `buildAnalyzePrompt` 供无附件路径/测试复用 |
| `app/api/analyze/route.ts` | body 改为 `AnalyzeInput & { attachments?: Attachment[] }`;Zod 校验;用 `buildAnalyzeContent` 拼块;实现多模态失败降级重试;响应可带 `attachmentsDropped` |
| `app/components/InputView.tsx` | 抽屉上传时用 `FileReader` 真读内容(文本 readAsText,PDF/图片 readAsDataURL);维护带 `data` 的文件列表;选中项组装成 `attachments` 通过 `onDecode` 传出;体积保护与提示 |
| `app/page.tsx` | `handleDecode(input, attachments)` 透传 attachments 给 `/api/analyze`;读取响应的 `attachmentsDropped` 存入 state;传给结果区展示 |
| `app/components/DecodeView.tsx` | 接收 `attachmentsDropped` prop,在 Step1 顶部显示提示条 |

## 4. 类型契约

```ts
// lib/attachment.ts
export type AttachmentKind = "text" | "pdf" | "image";
export interface Attachment {
  name: string;
  kind: AttachmentKind;
  mediaType: string;   // text:"text/plain"; pdf:"application/pdf"; image:"image/png"|...
  data: string;        // text: 原文; pdf/image: base64(去掉 data:URL 前缀)
}
```
- Zod:`kind` ∈ 枚举;`mediaType` ∈ 白名单(`text/plain,text/markdown,application/pdf,image/png,image/jpeg,image/webp`);`data` 非空。
- 服务端额外校验 base64 长度上限(防过大);超限 400。

## 5. 错误处理与边界

- **无附件**:行为与现状完全一致(回归测试保证)。
- **降级**:`messages.create` 抛错且 attachments 非空 → 去掉 document/image 块(保留文本附件并进的文字)重试一次;响应带 `attachmentsDropped:true`。重试仍失败 → 返回可读 500。
- **体积**:前端单文件 >4MB / 总量 >8MB 拦截并提示;服务端兜底 Zod 校验。
- **mediaType 非白名单**:前端跳过该文件并提示;服务端 Zod 拒绝。
- **不引入解析库**:纯 base64 + 模型多模态,Workers 友好。

## 6. 测试要点(mock SDK)

1. 带 PDF 附件 → 传给 SDK 的 user content 含 `type:"document"` 块。
2. 首次调用抛多模态相关错 → 第二次调用不含 document/image 块、成功、响应 `attachmentsDropped:true`。
3. 纯文本附件 → 内容并进 user 文本(含「参考材料:文件名」)。
4. 超大 / 非白名单附件 → 400。
5. 无附件 → 与现状一致(回归)。
6. `buildAnalyzeContent` 纯函数单测:各 kind 生成正确块结构。

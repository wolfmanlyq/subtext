# 言外之意 Subtext

把广告客户的混乱反馈一键转化为「甲方反馈行动卡」(需求卡 / 修改清单 / 回复话术),
并并排生成 2-3 个可点击的 HTML 方向小样,帮 AE 反向确认客户真实偏好。

## 本地运行

1. `npm install`
2. 复制 `.env.local.example` 为 `.env.local`,填入你的 `ANTHROPIC_API_KEY`
3. `npm run dev`,打开 http://localhost:3000
4. 点「用示例填充」→「生成行动卡」,体验白桃冰美式 demo

## 测试

```bash
npm run test
```

> 注:测试脚本把 `TMPDIR` 指向项目内 `.vitest-tmp`,以适配受限的临时目录环境。

## 技术栈

- Next.js 16 (App Router, TypeScript) 全栈
- Anthropic Claude(模型 `claude-opus-4-8`,官方 `@anthropic-ai/sdk`)
- Zod(结构化输出约束)
- Vitest + Testing Library(jsdom)

## 架构

两步结构化调用:

1. `POST /api/analyze` — Claude 结构化输出需求卡(9 字段)+ 修改清单 + 回复话术;
   信息不足时返回 `needMoreInfo` 与追问问题,不强行出结论。
2. `POST /api/prototypes` — 基于需求摘要生成 2-3 个自包含 HTML 方向小样;
   前端用 `<iframe sandbox srcDoc>` 隔离渲染、可点击。

设计与实现文档见 `docs/superpowers/`。

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

## 部署到 Cloudflare Workers

用 [OpenNext](https://opennext.js.org/cloudflare) 适配器,已配好一键脚本。

首次部署:

```bash
npx wrangler login                          # 浏览器授权你的 Cloudflare 账号
npx wrangler secret put ANTHROPIC_API_KEY   # 设置生产密钥(不走文件)
npm run deploy                              # 构建 Worker 包并上传
```

之后每次发布只需 `npm run deploy`。

本地以 Worker 运行时预览(而非 `next dev`):

```bash
cp .dev.vars.example .dev.vars   # 填入 ANTHROPIC_API_KEY(本地预览用)
npm run preview
```

说明:

- `wrangler.jsonc` 启用了 `nodejs_compat`,API 路由(调用 Anthropic SDK)以 Node 兼容运行时执行。
- 部署产物 `.open-next/` 由构建生成、`wrangler` 自动上传,**不手动选文件、不提交 git**。
- 生产密钥用 `wrangler secret`,**不要**把 key 写进任何上传的文件。
- ⚠️ 确认所用的 Anthropic 端点(`api.anthropic.com` 或自定义 `ANTHROPIC_BASE_URL`)能从 Cloudflare 边缘访问,否则线上调用会失败。


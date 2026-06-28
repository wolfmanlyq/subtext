import { NextResponse } from "next/server";
import { getClient, MODEL } from "@/lib/anthropic";
import { buildPrototypePrompt } from "@/lib/prompts";
import { callStructured, BadModelOutput } from "@/lib/tool-call";
import { PrototypesSchema } from "@/lib/prototype";

export const runtime = "nodejs";

interface Body {
  needSummary: string;
  rawFeedback: string;
}

export async function POST(request: Request): Promise<Response> {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "请求体解析失败" }, { status: 400 });
  }
  if (!body.needSummary || !body.rawFeedback) {
    return NextResponse.json({ error: "缺少需求摘要或原始反馈" }, { status: 400 });
  }

  const { system, user } = buildPrototypePrompt(body.needSummary, body.rawFeedback);

  async function getPrototypes() {
    return callStructured({
      client: getClient(),
      model: MODEL,
      maxTokens: 16000,
      system,
      content: user,
      schema: PrototypesSchema,
      toolName: "emit_prototypes",
      toolDescription:
        "返回 2-3 个方向小样(prototypes 数组,每个含 name/strategy/sampleCopy/highlight/recommend/html)。",
    });
  }

  try {
    return NextResponse.json(await getPrototypes());
  } catch (firstErr) {
    if (firstErr instanceof BadModelOutput) {
      try {
        return NextResponse.json(await getPrototypes());
      } catch (retryErr) {
        if (retryErr instanceof BadModelOutput) {
          console.error("[prototypes] 两次输出均无效");
          return NextResponse.json(
            { error: "生成小样失败:模型返回内容异常,请重试。" },
            { status: 500 },
          );
        }
        return connErr(retryErr);
      }
    }
    return connErr(firstErr);
  }

  function connErr(e: unknown): Response {
    const m = e instanceof Error ? e.message : "未知错误";
    console.error("[prototypes] 调用失败", {
      message: m,
      cause: e instanceof Error ? (e as { cause?: unknown }).cause : undefined,
      baseUrl: process.env.ANTHROPIC_BASE_URL ?? "(default api.anthropic.com)",
      keySet: !!process.env.ANTHROPIC_API_KEY,
    });
    return NextResponse.json({ error: `生成小样失败:${m}` }, { status: 500 });
  }
}

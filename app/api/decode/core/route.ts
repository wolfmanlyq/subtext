import { NextResponse } from "next/server";
import { getClient, MODEL } from "@/lib/anthropic";
import { CoreSchema, type Core } from "@/lib/schema";
import { buildCorePrompt, buildCoreContent } from "@/lib/prompts";
import { callStructured, BadModelOutput } from "@/lib/tool-call";
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
    industry: body.industry,
    brandName: body.brandName,
    clientRole: body.clientRole,
  };

  const FRIENDLY = "分析失败:模型返回内容异常,请重试。";
  const TOOL_DESCRIPTION =
    "返回客户反馈的结构化分析(needMoreInfo/realDemand/coreTension/foresight/evidence/questionsToConfirm)。";

  async function getCore(dropMultimodal: boolean): Promise<Core> {
    let system: string;
    let content: string | unknown[];
    if (attachments.length) {
      const built = buildCoreContent(input, attachments, { dropMultimodal });
      system = built.system;
      content = built.content;
    } else {
      const built = buildCorePrompt(input);
      system = built.system;
      content = built.user;
    }
    return callStructured({
      client: getClient(),
      model: MODEL,
      maxTokens: 12000,
      system,
      content,
      schema: CoreSchema,
      toolName: "emit_core",
      toolDescription: TOOL_DESCRIPTION,
    });
  }

  if (!attachments.length) {
    try {
      return NextResponse.json(await getCore(false));
    } catch (firstErr) {
      if (firstErr instanceof BadModelOutput) {
        try {
          return NextResponse.json(await getCore(false));
        } catch (retryErr) {
          if (retryErr instanceof BadModelOutput) {
            console.error("[decode/core] 两次输出均无效");
            return NextResponse.json({ error: FRIENDLY }, { status: 500 });
          }
          return connectionError(retryErr);
        }
      }
      return connectionError(firstErr);
    }
  }

  try {
    return NextResponse.json(await getCore(false));
  } catch {
    try {
      const core = await getCore(true);
      return NextResponse.json({ ...core, attachmentsDropped: true });
    } catch (secondErr) {
      if (secondErr instanceof BadModelOutput) {
        console.error("[decode/core] 降级后输出仍无效");
        return NextResponse.json({ error: FRIENDLY }, { status: 500 });
      }
      return connectionError(secondErr);
    }
  }

  function connectionError(e: unknown): Response {
    const m = e instanceof Error ? e.message : "未知错误";
    console.error("[decode/core] 调用失败", {
      message: m,
      cause: e instanceof Error ? (e as { cause?: unknown }).cause : undefined,
      baseUrl: process.env.ANTHROPIC_BASE_URL ?? "(default api.anthropic.com)",
      keySet: !!process.env.ANTHROPIC_API_KEY,
    });
    return NextResponse.json({ error: `分析失败:${m}` }, { status: 500 });
  }
}

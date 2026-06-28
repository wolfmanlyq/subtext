import { NextResponse } from "next/server";
import { getClient, MODEL } from "@/lib/anthropic";
import { CoreSchema, type Core } from "@/lib/schema";
import { buildCorePrompt, buildCoreContent } from "@/lib/prompts";
import { extractJson } from "@/lib/extract-json";
import { AttachmentsSchema, attachmentsWithinLimit } from "@/lib/attachment";
import type { AnalyzeInput } from "@/lib/demo";

export const runtime = "nodejs";

class BadModelOutput extends Error {}

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

  async function callModelText(dropMultimodal: boolean): Promise<string> {
    const built = attachments.length
      ? buildCoreContent(input, attachments, { dropMultimodal })
      : (() => {
          const { system, user } = buildCorePrompt(input);
          return { system, content: user };
        })();
    const msg = await getClient().messages.create({
      model: MODEL,
      max_tokens: 12000,
      system: built.system,
      messages: [{ role: "user", content: built.content }],
    });
    const textBlock = (msg.content as Array<{ type: string; text?: string }>).find(
      (b) => b.type === "text",
    );
    return textBlock?.text ?? "";
  }

  function parseCore(text: string): Core {
    try {
      return CoreSchema.parse(extractJson(text));
    } catch {
      throw new BadModelOutput("模型返回内容无法解析为分析结果");
    }
  }

  const FRIENDLY = "分析失败:模型返回内容异常,请重试。";

  if (!attachments.length) {
    try {
      return NextResponse.json(parseCore(await callModelText(false)));
    } catch (firstErr) {
      if (firstErr instanceof BadModelOutput) {
        try {
          return NextResponse.json(parseCore(await callModelText(false)));
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
    return NextResponse.json(parseCore(await callModelText(false)));
  } catch {
    try {
      const core = parseCore(await callModelText(true));
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

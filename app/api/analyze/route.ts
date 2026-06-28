import { NextResponse } from "next/server";
import { getClient, MODEL } from "@/lib/anthropic";
import { ActionCardSchema } from "@/lib/schema";
import { buildAnalyzePrompt, buildAnalyzeContent } from "@/lib/prompts";
import { extractJson } from "@/lib/extract-json";
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

  // 校验附件
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
  };

  async function callModel(dropMultimodal: boolean) {
    const built = attachments.length
      ? buildAnalyzeContent(input, attachments, { dropMultimodal })
      : (() => {
          const { system, user } = buildAnalyzePrompt(input);
          return { system, content: user };
        })();
    const msg = await getClient().messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: built.system,
      messages: [{ role: "user", content: built.content }],
    });
    const textBlock = (msg.content as Array<{ type: string; text?: string }>).find(
      (b) => b.type === "text",
    );
    return ActionCardSchema.parse(extractJson(textBlock?.text ?? ""));
  }

  try {
    const card = await callModel(false);
    return NextResponse.json(card);
  } catch (firstErr) {
    // 有附件 → 去掉多模态块重试一次
    if (attachments.length) {
      try {
        const card = await callModel(true);
        return NextResponse.json({ ...card, attachmentsDropped: true });
      } catch (secondErr) {
        const m = secondErr instanceof Error ? secondErr.message : "未知错误";
        console.error("[analyze] 降级重试仍失败", { message: m });
        return NextResponse.json({ error: `需求分析失败:${m}` }, { status: 500 });
      }
    }
    const m = firstErr instanceof Error ? firstErr.message : "未知错误";
    console.error("[analyze] 调用失败", {
      message: m,
      cause: firstErr instanceof Error ? (firstErr as { cause?: unknown }).cause : undefined,
      baseUrl: process.env.ANTHROPIC_BASE_URL ?? "(default api.anthropic.com)",
      keySet: !!process.env.ANTHROPIC_API_KEY,
    });
    return NextResponse.json({ error: `需求分析失败:${m}` }, { status: 500 });
  }
}

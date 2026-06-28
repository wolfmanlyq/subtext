import { NextResponse } from "next/server";
import { getClient, MODEL } from "@/lib/anthropic";
import { ActionCardSchema, type ActionCard } from "@/lib/schema";
import { buildAnalyzePrompt, buildAnalyzeContent } from "@/lib/prompts";
import { extractJson } from "@/lib/extract-json";
import { AttachmentsSchema, attachmentsWithinLimit } from "@/lib/attachment";
import type { AnalyzeInput } from "@/lib/demo";

export const runtime = "nodejs";

/** 模型返回了内容、但不是合法需求卡(解析或校验失败)—— 可重试。 */
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

  // 调一次模型,拿到文本(SDK 抛错=连接级,向上传播)
  async function callModelText(dropMultimodal: boolean): Promise<string> {
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
    return textBlock?.text ?? "";
  }

  // 把文本解析成卡片;失败统一抛 BadModelOutput(便于和连接错区分)
  function parseCard(text: string): ActionCard {
    try {
      return ActionCardSchema.parse(extractJson(text));
    } catch {
      throw new BadModelOutput("模型返回内容无法解析为需求卡");
    }
  }

  const FRIENDLY = "需求分析失败:模型返回内容异常,请重试。";

  // 无附件:中转偶发返回空/坏内容 → 解析失败自动重试一次;连接错不重试。
  if (!attachments.length) {
    try {
      return NextResponse.json(parseCard(await callModelText(false)));
    } catch (firstErr) {
      if (firstErr instanceof BadModelOutput) {
        try {
          return NextResponse.json(parseCard(await callModelText(false)));
        } catch (retryErr) {
          if (retryErr instanceof BadModelOutput) {
            console.error("[analyze] 两次输出均无效");
            return NextResponse.json({ error: FRIENDLY }, { status: 500 });
          }
          // 重试时连接错
          return connectionError(retryErr);
        }
      }
      return connectionError(firstErr);
    }
  }

  // 有附件:先带多模态;失败(连接错如中转不支持多模态,或解析失败)→ 去掉多模态块重试一次。
  try {
    return NextResponse.json(parseCard(await callModelText(false)));
  } catch {
    try {
      const card = parseCard(await callModelText(true));
      return NextResponse.json({ ...card, attachmentsDropped: true });
    } catch (secondErr) {
      if (secondErr instanceof BadModelOutput) {
        console.error("[analyze] 降级后输出仍无效");
        return NextResponse.json({ error: FRIENDLY }, { status: 500 });
      }
      return connectionError(secondErr);
    }
  }

  function connectionError(e: unknown): Response {
    const m = e instanceof Error ? e.message : "未知错误";
    console.error("[analyze] 调用失败", {
      message: m,
      cause: e instanceof Error ? (e as { cause?: unknown }).cause : undefined,
      baseUrl: process.env.ANTHROPIC_BASE_URL ?? "(default api.anthropic.com)",
      keySet: !!process.env.ANTHROPIC_API_KEY,
    });
    return NextResponse.json({ error: `需求分析失败:${m}` }, { status: 500 });
  }
}

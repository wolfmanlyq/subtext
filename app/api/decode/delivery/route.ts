import { NextResponse } from "next/server";
import { getClient, MODEL } from "@/lib/anthropic";
import { CoreSchema, DeliverySchema, type Delivery } from "@/lib/schema";
import { buildDeliveryPrompt } from "@/lib/prompts";
import { extractJson } from "@/lib/extract-json";
import type { AnalyzeInput } from "@/lib/demo";

export const runtime = "nodejs";

class BadModelOutput extends Error {}

export async function POST(request: Request): Promise<Response> {
  let body: AnalyzeInput & { core?: unknown };
  try {
    body = (await request.json()) as AnalyzeInput & { core?: unknown };
  } catch {
    return NextResponse.json({ error: "请求体解析失败" }, { status: 400 });
  }
  if (!body.feedback || body.feedback.trim().length < 4) {
    return NextResponse.json({ error: "请粘贴客户反馈内容" }, { status: 400 });
  }
  const parsedCore = CoreSchema.safeParse(body.core);
  if (!parsedCore.success) {
    return NextResponse.json({ error: "缺少有效的分析结果" }, { status: 400 });
  }
  const coreData = parsedCore.data;

  const input: AnalyzeInput = {
    feedback: body.feedback,
    projectType: body.projectType,
    stage: body.stage,
    audience: body.audience,
    clientStyle: body.clientStyle,
  };

  async function callText(): Promise<string> {
    const { system, user } = buildDeliveryPrompt(input, coreData);
    const msg = await getClient().messages.create({
      model: MODEL,
      max_tokens: 4000,
      system,
      messages: [{ role: "user", content: user }],
    });
    const textBlock = (msg.content as Array<{ type: string; text?: string }>).find(
      (b) => b.type === "text",
    );
    return textBlock?.text ?? "";
  }

  function parseDelivery(text: string): Delivery {
    try {
      return DeliverySchema.parse(extractJson(text));
    } catch {
      throw new BadModelOutput("模型返回内容无法解析为交付物");
    }
  }

  const FRIENDLY = "交付内容生成失败:模型返回内容异常,请重试。";

  try {
    return NextResponse.json(parseDelivery(await callText()));
  } catch (firstErr) {
    if (firstErr instanceof BadModelOutput) {
      try {
        return NextResponse.json(parseDelivery(await callText()));
      } catch (retryErr) {
        if (retryErr instanceof BadModelOutput) {
          console.error("[decode/delivery] 两次输出均无效");
          return NextResponse.json({ error: FRIENDLY }, { status: 500 });
        }
        return connectionError(retryErr);
      }
    }
    return connectionError(firstErr);
  }

  function connectionError(e: unknown): Response {
    const m = e instanceof Error ? e.message : "未知错误";
    console.error("[decode/delivery] 调用失败", { message: m });
    return NextResponse.json({ error: `交付内容生成失败:${m}` }, { status: 500 });
  }
}

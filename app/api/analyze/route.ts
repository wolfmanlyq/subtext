import { NextResponse } from "next/server";
import { getClient, MODEL } from "@/lib/anthropic";
import { ActionCardSchema } from "@/lib/schema";
import { buildAnalyzePrompt } from "@/lib/prompts";
import { extractJson } from "@/lib/extract-json";
import type { AnalyzeInput } from "@/lib/demo";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  let body: AnalyzeInput;
  try {
    body = (await request.json()) as AnalyzeInput;
  } catch {
    return NextResponse.json({ error: "请求体解析失败" }, { status: 400 });
  }

  if (!body.feedback || body.feedback.trim().length < 4) {
    return NextResponse.json({ error: "请粘贴客户反馈内容" }, { status: 400 });
  }

  const { system, user } = buildAnalyzePrompt(body);

  try {
    const msg = await getClient().messages.create({
      model: MODEL,
      max_tokens: 16000,
      system,
      messages: [{ role: "user", content: user }],
    });
    const textBlock = (msg.content as Array<{ type: string; text?: string }>).find(
      (b) => b.type === "text",
    );
    const card = ActionCardSchema.parse(extractJson(textBlock?.text ?? ""));
    return NextResponse.json(card);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "未知错误";
    return NextResponse.json({ error: `需求分析失败:${msg}` }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getClient, MODEL } from "@/lib/anthropic";
import { buildPrototypePrompt } from "@/lib/prompts";
import { extractJson } from "@/lib/extract-json";

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
    const data = extractJson(textBlock?.text ?? "");
    return NextResponse.json(data);
  } catch (e) {
    const m = e instanceof Error ? e.message : "未知错误";
    return NextResponse.json({ error: `生成小样失败:${m}` }, { status: 500 });
  }
}

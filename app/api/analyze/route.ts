import { NextResponse } from "next/server";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getClient, MODEL } from "@/lib/anthropic";
import { ActionCardSchema } from "@/lib/schema";
import { buildAnalyzePrompt } from "@/lib/prompts";
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
    const res = await getClient().messages.parse({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system,
      messages: [{ role: "user", content: user }],
      output_config: { format: zodOutputFormat(ActionCardSchema) },
    } as never);
    const parsed = (res as { parsed_output: unknown }).parsed_output;
    return NextResponse.json(parsed);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "未知错误";
    return NextResponse.json({ error: `需求分析失败:${msg}` }, { status: 500 });
  }
}

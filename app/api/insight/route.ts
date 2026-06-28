import { NextResponse } from "next/server";
import { getClient, MODEL } from "@/lib/anthropic";
import { InsightSchema, type Insight } from "@/lib/insight";
import { buildInsightPrompt } from "@/lib/prompts";
import { callStructured, BadModelOutput } from "@/lib/tool-call";
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

  const { system, user } = buildInsightPrompt(input);

  async function getInsight(): Promise<Insight> {
    return callStructured({
      client: getClient(),
      model: MODEL,
      maxTokens: 600,
      system,
      content: user,
      schema: InsightSchema,
      toolName: "emit_insight",
      toolDescription: "返回客户反馈的言外之意 keyInsight 与情绪强度 emotionIntensity。",
    });
  }

  function connErr(e: unknown): Response {
    const m = e instanceof Error ? e.message : "未知错误";
    console.error("[insight] 调用失败", { message: m });
    return NextResponse.json({ error: `快速洞察失败:${m}` }, { status: 500 });
  }

  try {
    return NextResponse.json(await getInsight());
  } catch (firstErr) {
    if (firstErr instanceof BadModelOutput) {
      try {
        return NextResponse.json(await getInsight());
      } catch (retryErr) {
        if (retryErr instanceof BadModelOutput) {
          console.error("[insight] 两次输出均无效");
          return NextResponse.json(
            { error: "快速洞察失败:模型返回内容异常,请重试。" },
            { status: 500 },
          );
        }
        return connErr(retryErr);
      }
    }
    return connErr(firstErr);
  }
}

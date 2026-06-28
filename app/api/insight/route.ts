import { NextResponse } from "next/server";
import { getClient, MODEL } from "@/lib/anthropic";
import { InsightSchema, type Insight } from "@/lib/insight";
import { buildInsightPrompt } from "@/lib/prompts";
import { extractJson } from "@/lib/extract-json";
import type { AnalyzeInput } from "@/lib/demo";

export const runtime = "nodejs";

class BadModelOutput extends Error {}

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

  const { system, user } = buildInsightPrompt(body);

  async function callText(): Promise<string> {
    const msg = await getClient().messages.create({
      model: MODEL,
      max_tokens: 600,
      system,
      messages: [{ role: "user", content: user }],
    });
    const textBlock = (msg.content as Array<{ type: string; text?: string }>).find(
      (b) => b.type === "text",
    );
    return textBlock?.text ?? "";
  }

  function parse(text: string): Insight {
    try {
      return InsightSchema.parse(extractJson(text));
    } catch {
      throw new BadModelOutput("洞察返回内容无法解析");
    }
  }

  try {
    return NextResponse.json(parse(await callText()));
  } catch (firstErr) {
    if (firstErr instanceof BadModelOutput) {
      try {
        return NextResponse.json(parse(await callText()));
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

  function connErr(e: unknown): Response {
    const m = e instanceof Error ? e.message : "未知错误";
    console.error("[insight] 调用失败", { message: m });
    return NextResponse.json({ error: `快速洞察失败:${m}` }, { status: 500 });
  }
}

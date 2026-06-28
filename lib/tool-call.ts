import { z } from "zod";

/** 模型返回了内容、但不是合法结构(无 tool_use 或 input 校验失败)—— 可重试。 */
export class BadModelOutput extends Error {}

/** Zod → Anthropic tool input_schema(去掉 z.toJSONSchema 注入的 $schema 顶层键)。 */
export function toInputSchema(schema: z.ZodType): Record<string, unknown> {
  const js = z.toJSONSchema(schema) as Record<string, unknown>;
  delete js["$schema"];
  return js;
}

interface CallArgs<T> {
  client: { messages: { create: (body: unknown) => Promise<{ content: unknown }> } };
  model: string;
  maxTokens: number;
  system: string;
  content: string | unknown[];
  schema: z.ZodType<T>;
  toolName: string;
  toolDescription: string;
}

/**
 * 以强制 tool_choice 调模型,从返回的(唯一)tool_use 块的 input 取结构化结果。
 * 中转会重命名 tool,故不按 name 匹配——取第一个 tool_use 块。
 */
export async function callStructured<T>(args: CallArgs<T>): Promise<T> {
  const tool = {
    name: args.toolName,
    description: args.toolDescription,
    input_schema: toInputSchema(args.schema),
  };
  const msg = await args.client.messages.create({
    model: args.model,
    max_tokens: args.maxTokens,
    system: args.system,
    tools: [tool],
    tool_choice: { type: "tool", name: args.toolName },
    messages: [{ role: "user", content: args.content }],
  });
  const blocks = (msg.content as Array<{ type: string; input?: unknown }>) ?? [];
  const toolUse = blocks.find((b) => b.type === "tool_use");
  if (!toolUse) throw new BadModelOutput("模型未返回 tool_use 结果");
  try {
    return args.schema.parse(toolUse.input);
  } catch {
    throw new BadModelOutput("tool_use 结果不符合预期结构");
  }
}

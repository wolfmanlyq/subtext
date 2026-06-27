/** 从模型文本中提取 JSON(容忍 ```json 代码块包裹与前后多余文字)。 */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("未找到 JSON");
  return JSON.parse(candidate.slice(start, end + 1));
}

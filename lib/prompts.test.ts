import { test, expect } from "vitest";
import { buildCorePrompt, buildPrototypePrompt, buildCoreContent, buildDeliveryPrompt, buildInsightPrompt } from "./prompts";
import type { AnalyzeInput } from "./demo";
import type { Attachment } from "./attachment";
import type { Core } from "./schema";

const input: AnalyzeInput = {
  feedback: "再高级一点,但别太硬广",
  projectType: "品牌海报",
  stage: "初稿反馈",
  audience: "设计",
  clientStyle: "保守",
};

test("buildCorePrompt 含 system、要求 JSON、产出 B 组字段、拼入用户输入", () => {
  const { system, user } = buildCorePrompt(input);
  expect(system).toMatch(/广告/);
  expect(system).toMatch(/JSON/);
  expect(system).toContain("realDemand");
  expect(system).toContain("coreTension");
  expect(system).toContain("questionsToConfirm");
  expect(system).not.toContain("clientReply"); // C 组字段不在 B
  expect(system).not.toContain("nextActions");
  expect(user).toContain("再高级一点");
  expect(user).toContain("品牌海报");
});

test("buildPrototypePrompt 要求自包含 HTML、含 name/highlight/recommend 且并入需求摘要", () => {
  const { system, user } = buildPrototypePrompt("客户要更想喝", "原始反馈文本");
  expect(system).toMatch(/HTML/);
  expect(system).toMatch(/内联|inline|自包含/);
  expect(system).toContain("highlight");
  expect(system).toContain("recommend");
  expect(user).toContain("客户要更想喝");
  expect(user).toContain("原始反馈文本");
});

const baseInput: AnalyzeInput = {
  feedback: "再高级一点", projectType: "品牌海报", stage: "初稿反馈", audience: "设计", clientStyle: "",
};
const pdfAtt: Attachment = { name: "brief.pdf", kind: "pdf", mediaType: "application/pdf", data: "QkFTRTY0" };
const txtAtt: Attachment = { name: "notes.txt", kind: "text", mediaType: "text/plain", data: "上一版偏冷淡" };
const imgAtt: Attachment = { name: "ref.png", kind: "image", mediaType: "image/png", data: "aW1n" };

test("buildCoreContent 无附件时只有一个 text 块且含反馈", () => {
  const { content } = buildCoreContent(baseInput, []);
  expect(content).toHaveLength(1);
  expect(content[0].type).toBe("text");
  expect((content[0] as { text: string }).text).toContain("再高级一点");
});

test("buildCoreContent PDF 附件生成 document 块", () => {
  const { content } = buildCoreContent(baseInput, [pdfAtt]);
  const doc = content.find((b) => b.type === "document") as { source: { media_type: string; data: string } } | undefined;
  expect(doc).toBeTruthy();
  expect(doc!.source.media_type).toBe("application/pdf");
  expect(doc!.source.data).toBe("QkFTRTY0");
});

test("buildCoreContent 图片附件生成 image 块", () => {
  const { content } = buildCoreContent(baseInput, [imgAtt]);
  expect(content.some((b) => b.type === "image")).toBe(true);
});

test("buildCoreContent 文本附件内容并进 text 块并标注文件名", () => {
  const { content } = buildCoreContent(baseInput, [txtAtt]);
  const textBlock = content.find((b) => b.type === "text") as { text: string };
  expect(textBlock.text).toContain("notes.txt");
  expect(textBlock.text).toContain("上一版偏冷淡");
});

test("buildCoreContent dropMultimodal 时不含 document/image 块,但保留文件名标注", () => {
  const { content } = buildCoreContent(baseInput, [pdfAtt, txtAtt], { dropMultimodal: true });
  expect(content.some((b) => b.type === "document" || b.type === "image")).toBe(false);
  const textBlock = content.find((b) => b.type === "text") as { text: string };
  expect(textBlock.text).toContain("brief.pdf");
});

test("buildInsightPrompt 只要 keyInsight+emotionIntensity 且拼入反馈", () => {
  const { system, user } = buildInsightPrompt(baseInput);
  expect(system).toContain("keyInsight");
  expect(system).toContain("emotionIntensity");
  expect(system).not.toContain("nextActions");
  expect(user).toContain("再高级一点");
});

const sampleCore: Core = {
  needMoreInfo: false,
  realDemand: { explicit: ["卖点更明确"], implicit: ["怕不卖货"] },
  coreTension: [{ left: "年轻化", right: "品牌质感", leftPercent: 65, rightPercent: 35, note: "n" }],
  foresight: ["下一轮会问为什么现在买"],
  evidence: ["客户先认可视觉"],
  questionsToConfirm: [],
};

test("buildDeliveryPrompt 产出 C 组字段、带入 core 分析、拼入反馈", () => {
  const { system, user } = buildDeliveryPrompt(input, sampleCore);
  expect(system).toMatch(/JSON/);
  expect(system).toContain("clientReply");
  expect(system).toContain("checklist");
  expect(system).toContain("nextActions");
  expect(user).toContain("再高级一点");        // 原始反馈
  expect(user).toContain("怕不卖货");           // 带入 core 的 implicit
  expect(user).toContain("年轻化");             // 带入 core 的 tension
});

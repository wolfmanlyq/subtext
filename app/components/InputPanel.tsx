"use client";
import { useState } from "react";
import { DEMO_INPUT, type AnalyzeInput } from "@/lib/demo";

const FIELDS: { key: keyof Omit<AnalyzeInput, "feedback">; label: string }[] = [
  { key: "projectType", label: "项目类型" },
  { key: "stage", label: "当前阶段" },
  { key: "audience", label: "输出对象" },
  { key: "clientStyle", label: "客户偏好/性格" },
];

export function InputPanel({
  onSubmit,
  loading,
}: {
  onSubmit: (input: AnalyzeInput) => void;
  loading: boolean;
}) {
  const [form, setForm] = useState<AnalyzeInput>({
    feedback: "",
    projectType: "",
    stage: "",
    audience: "",
    clientStyle: "",
  });

  return (
    <section className="panel">
      <label htmlFor="feedback">客户反馈原文</label>
      <textarea
        id="feedback"
        rows={6}
        value={form.feedback}
        placeholder="粘贴微信聊天 / 邮件 / 会议纪要 / 方案批注……"
        onChange={(e) => setForm({ ...form, feedback: e.target.value })}
      />
      <div className="tags">
        {FIELDS.map((f) => (
          <label key={f.key}>
            {f.label}
            <input
              value={form[f.key]}
              onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
            />
          </label>
        ))}
      </div>
      <div className="actions">
        <button type="button" onClick={() => setForm(DEMO_INPUT)}>
          用示例填充
        </button>
        <button
          type="button"
          disabled={loading || form.feedback.trim().length < 4}
          onClick={() => onSubmit(form)}
        >
          {loading ? "分析中…" : "生成行动卡"}
        </button>
      </div>
    </section>
  );
}

"use client";
import { useState } from "react";
import { InputPanel } from "./components/InputPanel";
import { ActionCard } from "./components/ActionCard";
import { PrototypeGallery } from "./components/PrototypeGallery";
import type { AnalyzeInput } from "@/lib/demo";
import type { ActionCard as Card } from "@/lib/schema";
import type { Prototype } from "@/lib/prototype";

export default function Page() {
  const [card, setCard] = useState<Card | null>(null);
  const [protos, setProtos] = useState<Prototype[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(input: AnalyzeInput) {
    setLoading(true);
    setError(null);
    setCard(null);
    setProtos(null);
    try {
      const r1 = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const c = await r1.json();
      if (!r1.ok) throw new Error(c.error || "分析失败");
      setCard(c);

      if (!c.needMoreInfo) {
        const summary = [c.oneLineTranslation, ...c.explicitNeeds, c.coreConflict]
          .filter(Boolean)
          .join("；");
        const r2 = await fetch("/api/prototypes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ needSummary: summary, rawFeedback: input.feedback }),
        });
        const p = await r2.json();
        if (!r2.ok) throw new Error(p.error || "生成小样失败");
        setProtos(p.prototypes ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "未知错误");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="container">
      <h1>言外之意 Subtext</h1>
      <p className="sub">把客户的混乱反馈,变成一张可执行的甲方反馈行动卡</p>
      <InputPanel onSubmit={handleSubmit} loading={loading} />
      {error && <p className="error">⚠️ {error}</p>}
      {card && <ActionCard card={card} />}
      {protos && protos.length > 0 && (
        <>
          <h2>方向确认小样</h2>
          <PrototypeGallery prototypes={protos} />
        </>
      )}
    </main>
  );
}

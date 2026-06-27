"use client";
import { useCallback, useRef, useState } from "react";
import { Landing } from "./components/Landing";
import { InputView } from "./components/InputView";
import { DecodeView } from "./components/DecodeView";
import type { AnalyzeInput } from "@/lib/demo";
import type { ActionCard } from "@/lib/schema";
import type { Prototype } from "@/lib/prototype";

type ViewId = "landing" | "input" | "decode";

export default function Page() {
  const [view, setView] = useState<ViewId>("landing");
  const [input, setInput] = useState<AnalyzeInput | null>(null);
  const [card, setCard] = useState<ActionCard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [samples, setSamples] = useState<Prototype[] | null>(null);
  const [samplesLoading, setSamplesLoading] = useState(false);
  const [samplesError, setSamplesError] = useState<string | null>(null);
  const samplesRequested = useRef(false);

  async function handleDecode(next: AnalyzeInput) {
    setLoading(true);
    setError(null);
    setCard(null);
    setSamples(null);
    setSamplesError(null);
    samplesRequested.current = false;
    try {
      const r = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "解码失败");
      setInput(next);
      setCard(data);
      setView("decode");
    } catch (e) {
      setError(e instanceof Error ? e.message : "未知错误");
    } finally {
      setLoading(false);
    }
  }

  const fetchSamples = useCallback(async () => {
    if (samplesRequested.current || !card || !input) return;
    samplesRequested.current = true;
    setSamplesLoading(true);
    setSamplesError(null);
    try {
      const summary = [
        card.agentJudgment,
        ...card.explicitNeeds,
        ...card.conflicts.map((c) => `${c.left} vs ${c.right}`),
      ]
        .filter(Boolean)
        .join("；");
      const r = await fetch("/api/prototypes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ needSummary: summary, rawFeedback: input.feedback }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "生成小样失败");
      setSamples(data.prototypes ?? []);
    } catch (e) {
      setSamplesError(e instanceof Error ? e.message : "未知错误");
    } finally {
      setSamplesLoading(false);
    }
  }, [card, input]);

  function reset() {
    setCard(null);
    setSamples(null);
    setSamplesError(null);
    samplesRequested.current = false;
    setView("input");
  }

  return (
    <main className="scene">
      <div className="noise" aria-hidden="true" />
      {view === "landing" && <Landing onStart={() => setView("input")} />}
      {view === "input" && (
        <div style={{ display: "grid", placeItems: "center", width: "100%" }}>
          <InputView
            loading={loading}
            onBack={() => setView("landing")}
            onDecode={handleDecode}
          />
          {error && (
            <p className="error-note" style={{ maxWidth: 1040, width: "100%" }}>
              ⚠️ {error}
            </p>
          )}
        </div>
      )}
      {view === "decode" && card && input && (
        <DecodeView
          card={card}
          input={input}
          samples={samples}
          samplesLoading={samplesLoading}
          samplesError={samplesError}
          onBack={() => setView("input")}
          onReset={reset}
          onNeedSamples={fetchSamples}
        />
      )}
    </main>
  );
}

"use client";
import { useCallback, useRef, useState } from "react";
import { Landing } from "./components/Landing";
import { WorkflowHome } from "./components/WorkflowHome";
import { InputView } from "./components/InputView";
import { DecodeView } from "./components/DecodeView";
import type { AnalyzeInput } from "@/lib/demo";
import type { ActionCard } from "@/lib/schema";
import type { Prototype } from "@/lib/prototype";

type ViewId = "landing" | "workflow" | "input" | "decode";

export default function Page() {
  const [view, setView] = useState<ViewId>("landing");
  const [input, setInput] = useState<AnalyzeInput | null>(null);
  const [card, setCard] = useState<ActionCard | null>(null);
  const [decodeStep, setDecodeStep] = useState(1);
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
      setDecodeStep(data.needMoreInfo ? 5 : 1);
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
        card.keyInsight,
        ...card.realDemand.explicit,
        ...card.realDemand.implicit,
        ...card.coreTension.map((t) => `${t.left} vs ${t.right}`),
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

  return (
    <main className="scene">
      <div className="noise" aria-hidden="true" />

      {view === "landing" && <Landing onStart={() => setView("workflow")} />}

      {view === "workflow" && (
        <WorkflowHome
          hasResult={!!card}
          onNewSignal={() => setView("input")}
          onPickStep={(step) => {
            setDecodeStep(step);
            setView("decode");
          }}
        />
      )}

      {view === "input" && (
        <div style={{ display: "grid", placeItems: "center", width: "100%" }}>
          <InputView
            loading={loading}
            onBack={() => setView("workflow")}
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
          key={decodeStep}
          card={card}
          input={input}
          initialStep={decodeStep}
          samples={samples}
          samplesLoading={samplesLoading}
          samplesError={samplesError}
          onBack={() => setView("input")}
          onReset={() => setView("input")}
          onDone={() => setView("workflow")}
          onNeedSamples={fetchSamples}
        />
      )}
    </main>
  );
}

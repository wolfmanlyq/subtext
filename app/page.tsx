"use client";
import { useCallback, useRef, useState } from "react";
import { Landing } from "./components/Landing";
import { WorkflowHome } from "./components/WorkflowHome";
import { InputView } from "./components/InputView";
import { DecodeView } from "./components/DecodeView";
import type { AnalyzeInput } from "@/lib/demo";
import type { ActionCard } from "@/lib/schema";
import type { Insight } from "@/lib/insight";
import type { Prototype } from "@/lib/prototype";

type ViewId = "landing" | "workflow" | "input" | "decode";

export default function Page() {
  const [view, setView] = useState<ViewId>("landing");
  const [input, setInput] = useState<AnalyzeInput | null>(null);
  const [card, setCard] = useState<ActionCard | null>(null);
  const [insight, setInsight] = useState<Insight | null>(null);
  const [decodeStep, setDecodeStep] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const [samples, setSamples] = useState<Prototype[] | null>(null);
  const [samplesLoading, setSamplesLoading] = useState(false);
  const [samplesError, setSamplesError] = useState<string | null>(null);
  const samplesRequested = useRef(false);
  const [attachmentsDropped, setAttachmentsDropped] = useState(false);

  const [decoding, setDecoding] = useState(false);

  async function handleDecode(
    next: AnalyzeInput,
    attachments: import("@/lib/attachment").Attachment[],
  ) {
    // 先把原话和解码视图显示出来,AI 字段稍后填入(原话=用户输入,0 延迟)
    setError(null);
    setCard(null);
    setInsight(null);
    setSamples(null);
    setSamplesError(null);
    setAttachmentsDropped(false);
    samplesRequested.current = false;
    setInput(next);
    setDecodeStep(1);
    setDecoding(true);
    setView("decode");

    // 快洞察:并发、独立;先回则 Step1 洞察秒显。失败静默(analyze 才是主数据源)。
    fetch("/api/insight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && d.keyInsight) setInsight(d as Insight);
      })
      .catch(() => {});

    try {
      const r = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...next, attachments }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "解码失败");
      setCard(data);
      setAttachmentsDropped(!!data.attachmentsDropped);
      setDecodeStep(data.needMoreInfo ? 5 : 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "未知错误");
      setView("input");
    } finally {
      setDecoding(false);
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

      {view === "landing" && <Landing onStart={() => setView("input")} />}

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
            loading={decoding}
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

      {view === "decode" && input && (
        <DecodeView
          key={decodeStep}
          card={card}
          insight={insight}
          cardLoading={decoding}
          input={input}
          initialStep={decodeStep}
          samples={samples}
          samplesLoading={samplesLoading}
          samplesError={samplesError}
          onBack={() => setView("input")}
          onReset={() => setView("input")}
          onDone={() => setView("workflow")}
          onNeedSamples={fetchSamples}
          attachmentsDropped={attachmentsDropped}
        />
      )}
    </main>
  );
}

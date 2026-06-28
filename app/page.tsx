"use client";
import { useCallback, useRef, useState } from "react";
import { Landing } from "./components/Landing";
import { WorkflowHome } from "./components/WorkflowHome";
import { InputView } from "./components/InputView";
import { DecodeView } from "./components/DecodeView";
import type { AnalyzeInput } from "@/lib/demo";
import type { Core, Delivery } from "@/lib/schema";
import type { Insight } from "@/lib/insight";
import type { Prototype } from "@/lib/prototype";

type ViewId = "landing" | "workflow" | "input" | "decode";

export default function Page() {
  const [view, setView] = useState<ViewId>("landing");
  const [input, setInput] = useState<AnalyzeInput | null>(null);
  const [insight, setInsight] = useState<Insight | null>(null);
  const [decodeStep, setDecodeStep] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const [core, setCore] = useState<Core | null>(null);
  const [coreLoading, setCoreLoading] = useState(false);
  const [coreError, setCoreError] = useState<string | null>(null);

  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);

  const [samples, setSamples] = useState<Prototype[] | null>(null);
  const [samplesLoading, setSamplesLoading] = useState(false);
  const [samplesError, setSamplesError] = useState<string | null>(null);
  const samplesRequested = useRef(false);
  const [attachmentsDropped, setAttachmentsDropped] = useState(false);

  async function handleDecode(
    next: AnalyzeInput,
    attachments: import("@/lib/attachment").Attachment[],
  ) {
    // 原话立即显示(=用户输入);AI 字段分组异步填入。
    setError(null);
    setInsight(null);
    setCore(null);
    setCoreError(null);
    setDelivery(null);
    setDeliveryError(null);
    setSamples(null);
    setSamplesError(null);
    setAttachmentsDropped(false);
    samplesRequested.current = false;
    setInput(next);
    setDecodeStep(1);
    setView("decode");

    // A 快洞察:并发、独立;先回则 Step1 洞察秒显。失败静默。
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

    // B 分析主体:并发。返回后填 Step2-5,并接着发起 C。
    setCoreLoading(true);
    try {
      const r = await fetch("/api/decode/core", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...next, attachments }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "分析失败");
      const coreData = data as Core & { attachmentsDropped?: boolean };
      setCore(coreData);
      setAttachmentsDropped(!!coreData.attachmentsDropped);
      setDecodeStep(coreData.needMoreInfo ? 5 : 1);
      void fetchDelivery(next, coreData);
    } catch (e) {
      setCoreError(e instanceof Error ? e.message : "未知错误");
    } finally {
      setCoreLoading(false);
    }
  }

  async function fetchDelivery(next: AnalyzeInput, coreData: Core) {
    setDeliveryLoading(true);
    setDeliveryError(null);
    try {
      const r = await fetch("/api/decode/delivery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...next, core: coreData }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "交付内容生成失败");
      setDelivery(data as Delivery);
    } catch (e) {
      setDeliveryError(e instanceof Error ? e.message : "未知错误");
    } finally {
      setDeliveryLoading(false);
    }
  }

  const fetchSamples = useCallback(async () => {
    if (samplesRequested.current || !core || !input) return;
    samplesRequested.current = true;
    setSamplesLoading(true);
    setSamplesError(null);
    try {
      const summary = [
        insight?.keyInsight,
        ...core.realDemand.explicit,
        ...core.realDemand.implicit,
        ...core.coreTension.map((t) => `${t.left} vs ${t.right}`),
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
  }, [core, input, insight]);

  return (
    <main className="scene">
      <div className="noise" aria-hidden="true" />

      {view === "landing" && <Landing onStart={() => setView("input")} />}

      {view === "workflow" && (
        <WorkflowHome
          hasResult={!!core}
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
            loading={coreLoading}
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
          insight={insight}
          core={core}
          coreLoading={coreLoading}
          coreError={coreError}
          delivery={delivery}
          deliveryLoading={deliveryLoading}
          deliveryError={deliveryError}
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

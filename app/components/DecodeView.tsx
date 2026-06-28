"use client";
import { useEffect, useState, type CSSProperties } from "react";
import type { ActionCard } from "@/lib/schema";
import type { AnalyzeInput } from "@/lib/demo";
import type { Prototype } from "@/lib/prototype";
import { PrototypeGallery } from "./PrototypeGallery";

const STEPS = [
  { n: 1, short: "原声", full: "甲方原声带" },
  { n: 2, short: "明话", full: "他说出口的 & 他真正担心的" },
  { n: 3, short: "纠结", full: "甲方纠结点" },
  { n: 4, short: "多想", full: "提前替客户想一遍" },
  { n: 5, short: "追问", full: "还得问甲方爸爸" },
  { n: 6, short: "方向", full: "先给甲方看这几个方向" },
  { n: 7, short: "开工", full: "接下来谁动手" },
];

function Bullets({ items }: { items: string[] }) {
  if (!items.length) return <p style={{ color: "var(--dim)" }}>—</p>;
  return (
    <ul>
      {items.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ul>
  );
}

export function DecodeView({
  card,
  input,
  samples,
  samplesLoading,
  samplesError,
  initialStep,
  onBack,
  onReset,
  onDone,
  onNeedSamples,
}: {
  card: ActionCard;
  input: AnalyzeInput;
  samples: Prototype[] | null;
  samplesLoading: boolean;
  samplesError: string | null;
  initialStep?: number;
  onBack: () => void;
  onReset: () => void;
  onDone: () => void;
  onNeedSamples: () => void;
}) {
  const [step, setStep] = useState(initialStep ?? (card.needMoreInfo ? 5 : 1));
  const [maxVisited, setMaxVisited] = useState(step);
  const [picked, setPicked] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setMaxVisited((m) => Math.max(m, step));
    if (step === 6) onNeedSamples();
  }, [step, onNeedSamples]);

  function go(n: number) {
    setStep(Math.max(1, Math.min(7, n)));
  }

  async function copyReply() {
    try {
      await navigator.clipboard?.writeText(card.clientReply);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard 不可用 */
    }
  }

  const current = STEPS[step - 1];

  return (
    <section className="view decode-view active">
      <nav
        className="topbar glass"
        aria-label="解码步骤"
        style={{ ["--progress"]: `${((step - 1) / 6) * 86}%` } as CSSProperties}
      >
        {STEPS.map((s) => {
          const state = s.n === step ? " active" : s.n < maxVisited ? " done" : "";
          return (
            <button key={s.n} className={`nav-step${state}`} onClick={() => go(s.n)}>
              <span className="nav-num">{s.n}</span>
              <span className="nav-label">{s.n === step ? s.full : s.short}</span>
            </button>
          );
        })}
      </nav>

      <section className="step-stage">
        <article
          className={`step-panel glass${step === 6 ? " final-panel" : ""}`}
          data-panel={step}
        >
          <div className="step-head">
            <div>
              <div className="label">Step {step} / {current.full}</div>
              <h2>{current.full}</h2>
            </div>
            <span className="status-pill">
              {card.needMoreInfo && step === 5 ? "Need Confirm" : "Decoded"}
            </span>
          </div>

          {/* Step 1 — 甲方原声带 + 言外之意 */}
          {step === 1 && (
            <>
              <div className="quote">{input.feedback}</div>
              {card.keyInsight && (
                <div className="key-insight-line">{card.keyInsight}</div>
              )}
              <div className="grid-2 metric-grid-compact" style={{ marginTop: 14 }}>
                <div className="mini-card metric">
                  <strong>情绪强度</strong>
                  <span>{card.emotionIntensity || "—"}</span>
                </div>
                <div className="mini-card metric insight-metric">
                  <strong>言外之意</strong>
                  <span>{card.keyInsight || "—"}</span>
                </div>
              </div>
            </>
          )}

          {/* Step 2 — 明话 / 潜台词 */}
          {step === 2 && (
            <div className="grid-2 demand-grid">
              <div className="mini-card demand-card visible">
                <div className="demand-title">
                  <span className="icon">☼</span>
                  <h3>他说出口的</h3>
                </div>
                <p className="micro-copy">客户已经说出口的修改方向,先摆清楚。</p>
                <Bullets items={card.realDemand.explicit} />
              </div>
              <div className="mini-card demand-card subtext">
                <div className="demand-title">
                  <span className="icon">◑</span>
                  <h3>他真正担心的</h3>
                </div>
                <p className="micro-copy">不用猜,先把潜台词拆开再决定怎么推进。</p>
                <Bullets items={card.realDemand.implicit} />
              </div>
            </div>
          )}

          {/* Step 3 — 甲方纠结点(倾向进度条) */}
          {step === 3 && (
            <div className="grid-2">
              {card.coreTension.length ? (
                card.coreTension.map((t, i) => (
                  <div className="vs-card tension-card" key={i}>
                    <div className="tension-row">
                      <span>{t.left}</span>
                      <b>VS</b>
                      <span>{t.right}</span>
                    </div>
                    <div className="tension-bar">
                      <div className="tension-fill" style={{ width: `${t.leftPercent}%` }} />
                    </div>
                    <div className="tension-percent">
                      <span>{t.leftPercent}%</span>
                      <span>{t.rightPercent}%</span>
                    </div>
                    <p className="tension-note">倾向判断:{t.note}</p>
                  </div>
                ))
              ) : (
                <p style={{ color: "var(--dim)" }}>未识别到明显纠结点。</p>
              )}
            </div>
          )}

          {/* Step 4 — 提前替客户想一遍 */}
          {step === 4 && (
            <div className="grid-2">
              <div className="mini-card">
                <h3>下一轮可能会被问到</h3>
                <div className="risk-list consulting">
                  {card.foresight.length ? (
                    card.foresight.map((r, i) => (
                      <div className="risk-item" key={i}>
                        {r}
                      </div>
                    ))
                  ) : (
                    <p style={{ color: "var(--dim)" }}>—</p>
                  )}
                </div>
              </div>
              <div className="mini-card">
                <h3>Evidence / 为什么要多想一步</h3>
                <Bullets items={card.evidence} />
              </div>
            </div>
          )}

          {/* Step 5 — 还得问甲方爸爸 */}
          {step === 5 && (
            <>
              <div className="grid-3">
                {card.questionsToConfirm.length ? (
                  card.questionsToConfirm.map((q, i) => (
                    <button
                      key={i}
                      className={`question-card${picked === q ? " active" : ""}`}
                      onClick={() => setPicked(q)}
                    >
                      {q}
                    </button>
                  ))
                ) : (
                  <p style={{ color: "var(--dim)" }}>本轮信息足够,无需额外反问。</p>
                )}
              </div>
              {picked && (
                <div className="generated-line">
                  老师,我们理解您希望下一版既解决购买理由,也保持品牌质感。这里想跟您确认一下:{picked}
                </div>
              )}
            </>
          )}

          {/* Step 6 — 先给甲方看这几个方向(回复 + 清单 + 小样) */}
          {step === 6 && (
            <div className="delivery">
              <div className="reply-card">
                <h3>客户回复话术</h3>
                <div className="reply-row">
                  <div className="bubble">{card.clientReply || "—"}</div>
                  <button className="btn-ghost" onClick={copyReply}>
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>

              <div className="mini-card">
                <h3>修改清单</h3>
                <p className="micro-copy" style={{ textAlign: "left", marginBottom: 0 }}>
                  把模糊反馈变成可检查的下一版动作。
                </p>
                <div className="checklist-grid">
                  {card.checklist.length ? (
                    card.checklist.map((c, i) => (
                      <div className="check-card" key={i}>
                        <div className="check-top">
                          <span className="check-title">
                            <span className="check-icon">✦</span>第 {i + 1} 项
                          </span>
                          <span className="check-tag">待落地</span>
                        </div>
                        <p>{c}</p>
                      </div>
                    ))
                  ) : (
                    <p style={{ color: "var(--dim)" }}>—</p>
                  )}
                </div>
              </div>

              <div>
                <div className="label" style={{ marginBottom: 12 }}>
                  方向确认小样
                </div>
                {samplesLoading && (
                  <p className="loading-note">正在生成 2-3 个可点击方向小样,稍候…</p>
                )}
                {samplesError && <p className="error-note">⚠️ {samplesError}</p>}
                {samples && samples.length > 0 && (
                  <PrototypeGallery prototypes={samples} />
                )}
              </div>
            </div>
          )}

          {/* Step 7 — 接下来谁动手 */}
          {step === 7 && (
            <div className="grid-5">
              {card.nextActions.length ? (
                card.nextActions.map((r, i) => (
                  <div className="role-card" key={i}>
                    <b>{r.role}</b>
                    <h3>{r.title}</h3>
                    <p>
                      {r.detail}
                      <br />
                      <span className="label">WHY</span> {r.reason}
                    </p>
                  </div>
                ))
              ) : (
                <p style={{ color: "var(--dim)" }}>—</p>
              )}
            </div>
          )}

          <div className="step-actions">
            {step > 1 ? (
              <button className="btn-ghost" onClick={() => go(step - 1)}>
                上一步
              </button>
            ) : (
              <button className="btn-ghost" onClick={onBack}>
                返回输入
              </button>
            )}
            {step < 7 ? (
              <button className="btn-primary" onClick={() => go(step + 1)}>
                下一步
              </button>
            ) : (
              <div className="right-actions">
                <button className="btn-ghost" onClick={onReset}>
                  重新输入
                </button>
                <button className="btn-primary" onClick={onDone}>
                  完成
                </button>
              </div>
            )}
          </div>
        </article>
      </section>
    </section>
  );
}

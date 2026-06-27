"use client";
import { useEffect, useState } from "react";
import type { ActionCard } from "@/lib/schema";
import type { AnalyzeInput } from "@/lib/demo";
import type { Prototype } from "@/lib/prototype";
import { PrototypeGallery } from "./PrototypeGallery";

const STEPS = [
  { n: 1, short: "原话", full: "原话识别" },
  { n: 2, short: "需求", full: "需求拆解" },
  { n: 3, short: "矛盾", full: "核心矛盾" },
  { n: 4, short: "风险", full: "风险识别" },
  { n: 5, short: "追问", full: "待确认项" },
  { n: 6, short: "执行", full: "分岗位执行" },
  { n: 7, short: "交付", full: "最终交付" },
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
  onBack,
  onReset,
  onNeedSamples,
}: {
  card: ActionCard;
  input: AnalyzeInput;
  samples: Prototype[] | null;
  samplesLoading: boolean;
  samplesError: string | null;
  onBack: () => void;
  onReset: () => void;
  onNeedSamples: () => void;
}) {
  const [step, setStep] = useState(card.needMoreInfo ? 5 : 1);
  const [maxVisited, setMaxVisited] = useState(step);
  const [picked, setPicked] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setMaxVisited((m) => Math.max(m, step));
    if (step === 7) onNeedSamples();
  }, [step, onNeedSamples]);

  function go(n: number) {
    setStep(Math.max(1, Math.min(7, n)));
  }

  async function copyReply() {
    try {
      await navigator.clipboard?.writeText(card.replyScript);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard 不可用时静默 */
    }
  }

  return (
    <section className="view decode-view active">
      <nav className="topbar glass" aria-label="解码步骤">
        {STEPS.map((s) => {
          const state =
            s.n === step ? " active" : s.n < maxVisited ? " done" : "";
          return (
            <button
              key={s.n}
              className={`nav-step${state}`}
              onClick={() => go(s.n)}
            >
              <span className="nav-num">{s.n}</span>
              <span className="nav-label">{s.n === step ? s.full : s.short}</span>
            </button>
          );
        })}
      </nav>

      <section className="step-stage">
        <article
          className={`step-panel glass${step === 7 ? " final-panel" : ""}`}
        >
          <div className="step-head">
            <div>
              <div className="label">
                Step {step} / {STEPS[step - 1].full}
              </div>
              <h2>{STEPS[step - 1].full}</h2>
            </div>
            <span className="status-pill">
              {card.needMoreInfo && step === 5 ? "Need Confirm" : "Decoded"}
            </span>
          </div>

          {step === 1 && (
            <>
              <div className="quote">{input.feedback}</div>
              <div className="grid-4" style={{ marginTop: 14 }}>
                <div className="mini-card metric">
                  <strong>情绪强度</strong>
                  <span>{card.emotionIntensity || "—"}</span>
                </div>
                <div className="mini-card metric">
                  <strong>项目阶段</strong>
                  <span>{input.stage || "—"}</span>
                </div>
                <div className="mini-card metric">
                  <strong>反馈类型</strong>
                  <span>{card.feedbackTypes.join(" / ") || "—"}</span>
                </div>
                <div className="mini-card metric">
                  <strong>Agent 判断</strong>
                  <span>{card.agentJudgment || "—"}</span>
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <div className="grid-2">
              <div className="mini-card">
                <h3>显性需求</h3>
                <Bullets items={card.explicitNeeds} />
              </div>
              <div className="mini-card">
                <h3>隐性需求</h3>
                <Bullets items={card.implicitNeeds} />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="grid-2">
              {card.conflicts.length ? (
                card.conflicts.map((c, i) => (
                  <div className="vs-card" key={i}>
                    <strong>{c.left}</strong>
                    <b>VS</b>
                    <strong>{c.right}</strong>
                  </div>
                ))
              ) : (
                <p style={{ color: "var(--dim)" }}>未识别到明显矛盾。</p>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="grid-2">
              <div className="mini-card">
                <h3>风险点</h3>
                <div className="risk-list">
                  {card.risks.length ? (
                    card.risks.map((r, i) => (
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
                <h3>Evidence / 判断依据</h3>
                <Bullets items={card.evidence} />
              </div>
            </div>
          )}

          {step === 5 && (
            <>
              <div className="grid-3">
                {card.questionsToAsk.length ? (
                  card.questionsToAsk.map((q, i) => (
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
                  老师,我们理解您希望下一版既加强购买理由,也保持品牌质感。这里想跟您确认一下:{picked}
                </div>
              )}
            </>
          )}

          {step === 6 && (
            <div className="grid-5">
              {card.roleActions.length ? (
                card.roleActions.map((r, i) => (
                  <div className="role-card" key={i}>
                    <b>{r.role}</b>
                    <h3>{r.title}</h3>
                    <p>{r.desc}</p>
                  </div>
                ))
              ) : (
                <p style={{ color: "var(--dim)" }}>—</p>
              )}
            </div>
          )}

          {step === 7 && (
            <div className="delivery">
              <div className="reply-card">
                <h3>客户回复话术</h3>
                <div className="reply-row">
                  <div className="bubble">{card.replyScript || "—"}</div>
                  <button className="btn-ghost" onClick={copyReply}>
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>

              <div className="mini-card">
                <h3>修改清单</h3>
                <ul className="checklist">
                  {card.checklist.length ? (
                    card.checklist.map((c, i) => <li key={i}>{c}</li>)
                  ) : (
                    <li>—</li>
                  )}
                </ul>
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
              </div>
            )}
          </div>
        </article>
      </section>
    </section>
  );
}

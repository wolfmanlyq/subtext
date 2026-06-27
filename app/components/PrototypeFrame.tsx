"use client";
import type { Prototype } from "@/lib/prototype";

const LETTERS = ["A", "B", "C", "D"];

export function PrototypeFrame({
  proto,
  index,
  active,
  onSelect,
}: {
  proto: Prototype;
  index: number;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <div className={`sample-card${active ? " active" : ""}`}>
      <b>{LETTERS[index] ?? index + 1}</b>
      <h3>{proto.strategy}</h3>
      <p className="strategy">适配:{proto.solvesFeedback}｜优先级:{proto.priority}</p>
      <iframe
        className="sample-frame"
        title={proto.strategy}
        sandbox="allow-popups"
        srcDoc={proto.html}
      />
      {proto.risk && <p className="risk">风险:{proto.risk}</p>}
      <button type="button" className="select-btn" onClick={onSelect}>
        {active ? "已选这个方向" : "选这个方向"}
      </button>
    </div>
  );
}

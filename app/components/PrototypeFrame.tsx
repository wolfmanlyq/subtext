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
      <iframe
        className="sample-frame"
        title={proto.name}
        sandbox="allow-popups"
        srcDoc={proto.html}
      />
      <div className="sample-meta">
        <b>{LETTERS[index] ?? index + 1}</b>
        {proto.recommend && <span className="recommend-pill">{proto.recommend}</span>}
      </div>
      <h3>{proto.name}</h3>
      <p className="strategy">策略:{proto.strategy}</p>
      {proto.sampleCopy && <p className="line">{proto.sampleCopy}</p>}
      {proto.highlight && <p className="highlight">方向亮点:{proto.highlight}</p>}
      <button type="button" className="select-btn" onClick={onSelect}>
        {active ? "已选这个方向" : "选这个方向"}
      </button>
    </div>
  );
}

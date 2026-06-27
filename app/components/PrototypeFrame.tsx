"use client";
import type { Prototype } from "@/lib/prototype";

export function PrototypeFrame({ proto }: { proto: Prototype }) {
  return (
    <div className="proto">
      <h4>{proto.strategy}</h4>
      <iframe
        title={proto.strategy}
        sandbox="allow-popups"
        srcDoc={proto.html}
        style={{ width: "100%", height: 360, border: "1px solid #ddd", borderRadius: 8 }}
      />
      <p className="proto-meta">
        适配:{proto.solvesFeedback}｜风险:{proto.risk}｜优先级:{proto.priority}
      </p>
    </div>
  );
}

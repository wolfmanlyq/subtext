"use client";
import { useState } from "react";
import type { Prototype } from "@/lib/prototype";
import { PrototypeFrame } from "./PrototypeFrame";

export function PrototypeGallery({ prototypes }: { prototypes: Prototype[] }) {
  const [selected, setSelected] = useState<number | null>(null);
  const pick = selected !== null ? prototypes[selected] : null;

  return (
    <div>
      <div className="gallery">
        {prototypes.map((p, i) => (
          <PrototypeFrame
            key={i}
            proto={p}
            index={i}
            active={selected === i}
            onSelect={() => setSelected(i)}
          />
        ))}
      </div>
      {pick && (
        <div className="sample-judgement">
          AI 判断:你选了【{pick.name}】——说明本轮更应优先解决「{pick.highlight || pick.strategy}」这一层。这是从你的选择行为反推出来的偏好,而非预设答案。
        </div>
      )}
    </div>
  );
}

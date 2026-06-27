"use client";
import type { Prototype } from "@/lib/prototype";
import { PrototypeFrame } from "./PrototypeFrame";

export function PrototypeGallery({ prototypes }: { prototypes: Prototype[] }) {
  return (
    <section className="gallery">
      {prototypes.map((p, i) => (
        <PrototypeFrame key={i} proto={p} />
      ))}
    </section>
  );
}

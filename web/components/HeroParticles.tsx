"use client";
import { useEffect, useRef, useState } from "react";
import { startHeroParticles } from "@/lib/heroParticles";

// Destaque da página inicial: corações do logótipo que formam o símbolo, uma soca e uma meia, em 3D
export default function HeroParticles({ labels }: { labels: Record<string, string> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [shape, setShape] = useState("logo");
  useEffect(() => (ref.current ? startHeroParticles(ref.current, setShape) : undefined), []);
  return (
    <div className="h4-stage fx">
      <canvas ref={ref} className="fx-canvas" />
      <div className="fx-label" key={shape}>{labels[shape] ?? ""}</div>
    </div>
  );
}

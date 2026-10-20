"use client";
import { useEffect, useRef, useState } from "react";
import { startHeroParticles } from "@/lib/heroParticles";

// Destaque da página inicial: holograma de pontos de luz que desenha o símbolo e fotos reais de uma soca e de uma meia
export default function HeroParticles({ labels, images }: { labels: Record<string, string>; images: { soca?: string; meia?: string } }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [shape, setShape] = useState("logo");
  useEffect(() => (ref.current ? startHeroParticles(ref.current, images, setShape) : undefined), [images.soca, images.meia]);
  return (
    <div className="h4-stage fx">
      <canvas ref={ref} className="fx-canvas" />
      <div className="fx-label" key={shape}>{labels[shape] ?? ""}</div>
    </div>
  );
}

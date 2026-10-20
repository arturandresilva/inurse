"use client";
import { useEffect, useRef, useState } from "react";
import { startHero3D } from "@/lib/hero3d";

// Destaque da página inicial: modelos 3D de partículas (símbolo iNurse, soca e collant) que rodam e se transformam
export default function HeroParticles({ labels }: { labels: Record<string, string> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [shape, setShape] = useState("logo");
  useEffect(() => (ref.current ? startHero3D(ref.current, { onShape: setShape }) : undefined), []);
  return (
    <div className="h4-stage fx">
      <canvas ref={ref} className="fx-gl" />
      <div className="fx-hud" aria-hidden="true">
        <span className="fx-c tl" /><span className="fx-c tr" /><span className="fx-c bl" /><span className="fx-c br" />
        <div className="fx-top"><b>iNURSE</b> 3D <i className="fx-rec" /></div>
      </div>
      <div className="fx-label" key={shape}>{labels[shape] ?? ""}</div>
    </div>
  );
}

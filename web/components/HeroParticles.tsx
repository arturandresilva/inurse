"use client";
import { useEffect, useRef, useState } from "react";
import { startHeroParticles } from "@/lib/heroParticles";

// Destaque da página inicial: digitalização 3D (inspiração médica) do símbolo iNurse e de fotos reais de uma soca e de uma meia
export default function HeroParticles({ labels, images }: { labels: Record<string, string>; images: { soca?: string; meia?: string } }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const angle = useRef<HTMLSpanElement>(null);
  const [shape, setShape] = useState("logo");
  useEffect(() => {
    if (!ref.current) return;
    return startHeroParticles(ref.current, images, {
      onShape: setShape,
      onAngle: (d) => { if (angle.current) angle.current.textContent = String(d).padStart(3, "0"); },
    });
  }, [images.soca, images.meia]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="h4-stage fx">
      <canvas ref={ref} className="fx-canvas" />
      <div className="fx-hud" aria-hidden="true">
        <span className="fx-c tl" /><span className="fx-c tr" /><span className="fx-c bl" /><span className="fx-c br" />
        <div className="fx-top"><b>iNURSE</b> 3D SCAN <i className="fx-rec" /></div>
        <div className="fx-rot">ROT <span ref={angle}>000</span>°</div>
      </div>
      <div className="fx-label" key={shape}>{labels[shape] ?? ""}</div>
    </div>
  );
}

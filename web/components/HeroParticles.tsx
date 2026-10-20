"use client";
import { useEffect, useRef, useState } from "react";
import { startHeroScan } from "@/lib/heroScan";

// Destaque da página inicial: estúdio de digitalização — cada produto materializa-se em pontos, uma linha de
// varrimento revela a fotografia real, que flutua em 3D; depois desfaz-se e dá lugar ao seguinte
export default function HeroParticles({ labels, images }: { labels: Record<string, string>; images: { soca?: string; meia?: string } }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shape, setShape] = useState("logo");
  const [phase, setPhase] = useState("assemble");
  useEffect(() => {
    if (!ref.current) return;
    return startHeroScan(ref.current, images, { onShape: setShape, onPhase: setPhase });
  }, [images.soca, images.meia]); // eslint-disable-line react-hooks/exhaustive-deps
  const status = phase === "scan" ? "A DIGITALIZAR" : phase === "hold" ? "MODELO 3D" : "A PROCESSAR";
  return (
    <div className="h4-stage fx" ref={ref}>
      <canvas className="fx-back" />
      <div className="fx-photo"><img alt="" /><div className="fx-sheen" /></div>
      <canvas className="fx-front" />
      <div className="fx-hud" aria-hidden="true">
        <span className="fx-c tl" /><span className="fx-c tr" /><span className="fx-c bl" /><span className="fx-c br" />
        <div className="fx-top"><b>iNURSE</b> 3D SCAN <i className="fx-rec" /></div>
        <div className="fx-rot">{status}</div>
      </div>
      <div className="fx-label" key={shape}>{labels[shape] ?? ""}</div>
    </div>
  );
}

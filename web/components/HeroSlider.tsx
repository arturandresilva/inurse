"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Campaign } from "@/lib/home";

// Campanha da página inicial: diapositivos de imagem ou vídeo que passam sozinhos (param ao passar o rato
// ou com "reduzir movimento" ligado no sistema). "topo" = destaque grande; "faixa" = banner a meio da página.
export default function HeroSlider({ c, labels }: { c: Campaign; labels: { prev: string; next: string; go: string; pause: string; play: string } }) {
  const n = c.slides.length;
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hover, setHover] = useState(false);
  const vids = useRef<(HTMLVideoElement | null)[]>([]);
  const go = useCallback((k: number) => setI(((k % n) + n) % n), [n]);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) setPaused(true);
  }, []);
  useEffect(() => {
    if (n < 2 || paused || hover) return;
    const id = setTimeout(() => go(i + 1), c.interval_s * 1000);
    return () => clearTimeout(id);
  }, [i, n, paused, hover, c.interval_s, go]);
  // só o vídeo do diapositivo visível está a tocar
  useEffect(() => {
    vids.current.forEach((v, k) => { if (!v) return; if (k === i && !paused) v.play().catch(() => {}); else v.pause(); });
  }, [i, paused]);

  return (
    <section className={`slider slider-${c.placement}`} aria-roledescription="carrossel" aria-label={c.name}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onFocus={() => setHover(true)} onBlur={() => setHover(false)}>
      <div className="slider-track">
        {c.slides.map((s, k) => {
          const content = (s.eyebrow || s.title || s.body || s.cta_label) && (
            <div className={`wrap slide-copy al-${s.align}`}>
              <div>
                {s.eyebrow && <p className="eyebrow">{s.eyebrow}</p>}
                {s.title && (k === 0 && c.placement === "topo" ? <h1>{s.title}</h1> : <h2>{s.title}</h2>)}
                {s.body && <p className="lead">{s.body}</p>}
                {s.cta_label && s.cta_url && <span className="btn">{s.cta_label}</span>}
              </div>
            </div>
          );
          const media = s.kind === "video" ? (
            <video ref={(el) => { vids.current[k] = el; }} src={s.media_url} poster={s.poster_url ?? undefined} muted loop playsInline preload={k === 0 ? "auto" : "metadata"} autoPlay={k === 0} aria-hidden="true" />
          ) : (
            <picture>
              {s.mobile_url && <source media="(max-width: 700px)" srcSet={s.mobile_url} />}
              <img src={s.media_url} alt={s.title ?? ""} loading={k === 0 ? "eager" : "lazy"} fetchPriority={k === 0 ? "high" : undefined} />
            </picture>
          );
          const inner = <>{media}{content && <div className={`slide-shade ${s.theme} al-${s.align}`} />}{content}</>;
          return (
            <div key={s.id} className={`slide theme-${s.theme}${k === i ? " on" : ""}`} aria-hidden={k !== i} role="group" aria-roledescription="diapositivo" aria-label={`${k + 1} / ${n}`}>
              {s.cta_url ? <Link href={s.cta_url} tabIndex={k === i ? 0 : -1} className="slide-link">{inner}</Link> : inner}
            </div>
          );
        })}
      </div>
      {n > 1 && (
        <>
          <button type="button" className="slider-arrow prev" aria-label={labels.prev} onClick={() => go(i - 1)}>‹</button>
          <button type="button" className="slider-arrow next" aria-label={labels.next} onClick={() => go(i + 1)}>›</button>
          <div className="slider-dots">
            {c.slides.map((s, k) => <button key={s.id} type="button" className={k === i ? "on" : ""} aria-label={`${labels.go} ${k + 1}`} aria-current={k === i} onClick={() => go(k)} />)}
            <button type="button" className="slider-pause" aria-label={paused ? labels.play : labels.pause} onClick={() => setPaused((p) => !p)}>{paused ? "▶" : "❚❚"}</button>
          </div>
        </>
      )}
    </section>
  );
}

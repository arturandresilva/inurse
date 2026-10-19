"use client";
import { useState } from "react";
import { useT } from "@/lib/i18n/client";

export default function Gallery({ images, alt }: { images: string[]; alt: string }) {
  const t = useT();
  const [i, setI] = useState(0);
  if (!images.length) return <div className="gallery"><div className="main" /></div>;
  return (
    <div className="gallery">
      <div className="main"><img src={images[i]} alt={alt} /></div>
      {images.length > 1 && (
        <div className="thumbs">
          {images.map((src, k) => (
            <button key={src} aria-pressed={k === i} aria-label={t("Imagem {n}", { n: k + 1 })} onClick={() => setI(k)}><img src={src} alt="" loading="lazy" /></button>
          ))}
        </div>
      )}
    </div>
  );
}

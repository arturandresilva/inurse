"use client";
import { useState } from "react";

export default function Gallery({ images, alt }: { images: string[]; alt: string }) {
  const [i, setI] = useState(0);
  if (!images.length) return <div className="gallery"><div className="main" /></div>;
  return (
    <div className="gallery">
      <div className="main"><img src={images[i]} alt={alt} /></div>
      {images.length > 1 && (
        <div className="thumbs">
          {images.map((src, k) => (
            <button key={src} aria-pressed={k === i} aria-label={`Imagem ${k + 1}`} onClick={() => setI(k)}><img src={src} alt="" loading="lazy" /></button>
          ))}
        </div>
      )}
    </div>
  );
}

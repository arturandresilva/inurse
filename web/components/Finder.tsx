"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "@/lib/i18n/client";

// "Encontra o teu par": escolhe o tipo e o número e vê só os modelos que há no teu tamanho
export default function Finder({ cats, sizes }: { cats: { href: string; name: string }[]; sizes: string[] }) {
  const t = useT();
  const router = useRouter();
  const [cat, setCat] = useState(cats[0]?.href ?? "/loja");
  const [size, setSize] = useState("");
  return (
    <form className="finder" onSubmit={(e) => { e.preventDefault(); router.push(`${cat}${size ? `?tamanho=${size}` : ""}`); }}>
      <div className="finder-step">
        <span className="finder-n">1</span>
        <div><span className="finder-l">{t("O que procuras?")}</span>
          <div className="finder-opts" role="radiogroup" aria-label={t("O que procuras?")}>
            {cats.map((c) => <button key={c.href} type="button" role="radio" aria-checked={cat === c.href} className={cat === c.href ? "on" : ""} onClick={() => setCat(c.href)}>{c.name}</button>)}
          </div></div>
      </div>
      <div className="finder-step">
        <span className="finder-n">2</span>
        <div><label className="finder-l" htmlFor="finder-size">{t("Que número calças?")}</label>
          <select id="finder-size" value={size} onChange={(e) => setSize(e.target.value)}>
            <option value="">{t("Todos os números")}</option>
            {sizes.map((s) => <option key={s} value={s}>{s}</option>)}
          </select></div>
      </div>
      <button className="btn finder-go">{t("Ver os modelos")} <span aria-hidden="true">→</span></button>
    </form>
  );
}

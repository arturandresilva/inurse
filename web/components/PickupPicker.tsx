"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useT } from "@/lib/i18n/client";

export type Point = { code: string; name: string; kind?: string; address?: string | null; zip: string; city?: string | null };
const KIND: Record<string, string> = { loja: "Loja CTT", ponto: "Ponto CTT", cacifo: "Cacifo" };

// Escolha do ponto CTT para levantar a encomenda: procura pelo código postal; se a lista de pontos ainda não estiver carregada,
// o cliente escreve o ponto que prefere (e pode consultá-lo no site dos CTT)
export default function PickupPicker({ zip, value, onChange }: { zip: string; value: Point | null; onChange: (p: Point | null) => void }) {
  const t = useT();
  const [q, setQ] = useState(zip);
  const [list, setList] = useState<Point[] | null>(null);
  const [manual, setManual] = useState(false);
  useEffect(() => { if (zip && !q) setQ(zip); }, [zip, q]);
  useEffect(() => {
    const z = q.replace(/\D/g, "");
    if (z.length < 4) { setList(null); return; }
    const id = setTimeout(async () => {
      const { data } = await supabase.rpc("pickup_points_near", { p_zip: z, p_limit: 12 });
      setList((data as Point[]) ?? []);
    }, 300);
    return () => clearTimeout(id);
  }, [q]);
  const free = manual || (list !== null && list.length === 0);

  return (
    <div className="pickup">
      <div className="field"><label htmlFor="pk-zip">{t("Código postal perto de onde queres levantar")}</label>
        <input id="pk-zip" inputMode="numeric" value={q} onChange={(e) => setQ(e.target.value)} placeholder="4590-000" /></div>
      {!free && list && (
        <div className="pickup-list" role="radiogroup" aria-label={t("Pontos CTT")}>
          {list.map((p) => (
            <label key={p.code} className={value?.code === p.code ? "on" : ""}>
              <input type="radio" name="pickup" checked={value?.code === p.code} onChange={() => onChange(p)} />
              <span><strong>{p.name}</strong><small>{t(KIND[p.kind ?? "ponto"] ?? "Ponto CTT")} · {[p.address, `${p.zip} ${p.city ?? ""}`].filter(Boolean).join(", ")}</small></span>
            </label>
          ))}
          <button type="button" className="link" onClick={() => { setManual(true); onChange(null); }}>{t("Prefiro indicar outro ponto")}</button>
        </div>
      )}
      {free && (
        <div className="field">
          <label htmlFor="pk-free">{t("Ponto CTT onde queres levantar (nome ou morada)")}</label>
          <input id="pk-free" value={value?.code ? "" : value?.name ?? ""} placeholder={t("Ex.: Loja CTT de Paços de Ferreira")}
            onChange={(e) => onChange(e.target.value.trim() ? { code: "", name: e.target.value, zip: q } : null)} />
          <small className="muted">{t("Podes ver os pontos CTT perto de ti em")} <a href="https://www.ctt.pt/" target="_blank" rel="noopener noreferrer">ctt.pt</a>.</small>
        </div>
      )}
    </div>
  );
}

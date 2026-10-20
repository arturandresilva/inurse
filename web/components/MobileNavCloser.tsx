"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Fecha o menu do telemóvel (☰) e o menu "Loja" do computador ao escolher uma opção, ao pesquisar, ao tocar fora dele ou com a tecla Esc
let megaOff = false;

export default function MobileNavCloser() {
  const path = usePathname();
  useEffect(() => {
    document.querySelectorAll<HTMLDetailsElement>("details.mnav[open]").forEach((d) => (d.open = false));
    if (megaOff) document.documentElement.classList.add("mega-off");   // a navegação pode refazer o <html>
  }, [path]);
  useEffect(() => {
    const close = () => document.querySelectorAll<HTMLDetailsElement>("details.mnav[open]").forEach((d) => (d.open = false));
    const onClick = (e: MouseEvent) => {
      const el = e.target as Element | null;
      const nav = el?.closest("details.mnav");
      if (!nav) close();                                   // toque fora do menu
      else if (el?.closest(".mnav-panel a")) close();      // escolheu uma categoria ou modelo
      // menu "Loja" do computador: abre ao passar o rato; depois de escolher, fecha e só volta a abrir quando o rato sair e voltar
      if (el?.closest(".mega-wrap") && el.closest("a")) {
        megaOff = true; document.documentElement.classList.add("mega-off");
        (document.activeElement as HTMLElement | null)?.blur();
      }
    };
    const onSubmit = (e: Event) => { if ((e.target as Element)?.closest("details.mnav")) close(); };
    // o menu volta a abrir só depois de o rato sair da zona do menu
    const onOver = (e: MouseEvent) => { if (megaOff && !(e.target as Element | null)?.closest?.(".mega-wrap")) { megaOff = false; document.documentElement.classList.remove("mega-off"); } };
    document.addEventListener("mousemove", onOver);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("click", onClick);
    document.addEventListener("submit", onSubmit);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("click", onClick); document.removeEventListener("submit", onSubmit); document.removeEventListener("keydown", onKey); document.removeEventListener("mousemove", onOver); };
  }, []);
  return null;
}

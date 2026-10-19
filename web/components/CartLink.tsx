"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { onCartChange, readCart } from "@/lib/cart";
import { useT } from "@/lib/i18n/client";

export default function CartLink() {
  const t = useT();
  const [n, setN] = useState(0);
  useEffect(() => {
    const upd = () => setN(readCart().reduce((a, l) => a + l.qty, 0));
    upd();
    return onCartChange(upd);
  }, []);
  return (
    <Link href="/carrinho" className="cart-link" aria-label={t("Carrinho, {n} artigos", { n })}>
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.5L20.5 8H6.2" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /><circle cx="10" cy="19.5" r="1.4" fill="currentColor" /><circle cx="17" cy="19.5" r="1.4" fill="currentColor" /></svg>
      <span className="cart-label">{t("Carrinho")}</span> <span className="cart-count">{n}</span>
    </Link>
  );
}

"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { onCartChange, readCart } from "@/lib/cart";

export default function CartLink() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const upd = () => setN(readCart().reduce((a, l) => a + l.qty, 0));
    upd();
    return onCartChange(upd);
  }, []);
  return (
    <Link href="/carrinho" className="cart-link" aria-label={`Carrinho, ${n} artigos`}>
      Carrinho <span className="cart-count">{n}</span>
    </Link>
  );
}

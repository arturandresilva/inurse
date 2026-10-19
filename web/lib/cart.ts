"use client";
import { supabase } from "./supabase";

export type CartLine = { variant_id: string; qty: number; title: string; size: string; price_cents: number; image: string | null; handle: string };
const KEY = "inurse.cart";
const TOKEN = "inurse.cart_token";
const EVT = "inurse:cart";

function safeGet(k: string) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k: string, v: string | null) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* sem storage */ } }

export function readCart(): CartLine[] {
  try { const c = JSON.parse(safeGet(KEY) || "[]"); return Array.isArray(c) ? c : []; } catch { return []; }
}
export const cartToken = () => safeGet(TOKEN);

async function sync(lines: CartLine[], email?: string) {
  try {
    const { data } = await supabase.rpc("save_cart", {
      p_token: cartToken(), p_items: lines.map((l) => ({ variant_id: l.variant_id, qty: l.qty })), p_email: email ?? null,
    });
    if (data) safeSet(TOKEN, String(data));
  } catch { /* carrinho continua a funcionar localmente */ }
}

export function writeCart(lines: CartLine[], email?: string) {
  safeSet(KEY, JSON.stringify(lines));
  window.dispatchEvent(new Event(EVT));
  void sync(lines, email);
}
export function addToCart(line: CartLine) {
  const lines = readCart();
  const i = lines.findIndex((l) => l.variant_id === line.variant_id);
  if (i >= 0) lines[i].qty = Math.min(20, lines[i].qty + line.qty); else lines.push(line);
  writeCart(lines);
}
export function clearCart() { safeSet(KEY, null); safeSet(TOKEN, null); window.dispatchEvent(new Event(EVT)); }
export function onCartChange(cb: () => void) {
  window.addEventListener(EVT, cb); window.addEventListener("storage", cb);
  return () => { window.removeEventListener(EVT, cb); window.removeEventListener("storage", cb); };
}

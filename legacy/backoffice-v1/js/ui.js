// Utilitários de interface
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const eur = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });
export const money = (cents) => (cents == null ? '—' : eur.format(cents / 100));
export const toCents = (s) => {
  const n = Number(String(s).replace(/\s/g, '').replace('€', '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};
export const centsInput = (c) => (c == null ? '' : (c / 100).toFixed(2).replace('.', ','));
export const date = (d) => (d ? new Date(d).toLocaleDateString('pt-PT') : '—');
export const dateTime = (d) => (d ? new Date(d).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' }) : '—');

export const ORDER_STATUS = {
  pending_payment: ['Aguarda pagamento', 'warn'],
  paid: ['Paga', 'ok'],
  processing: ['Em preparação', 'info'],
  shipped: ['Enviada', 'info'],
  delivered: ['Entregue', 'ok'],
  cancelled: ['Cancelada', 'muted'],
  refunded: ['Reembolsada', 'muted'],
};
export const PRODUCT_STATUS = {
  active: ['Ativo', 'ok'], out_of_stock: ['Esgotado', 'warn'], draft: ['Rascunho', 'muted'], archived: ['Arquivado', 'muted'],
};
export const PAY = { mbway: 'MB WAY', multibanco: 'Multibanco', transfer: 'Transferência' };
export const badge = (map, k) => { const [t, c] = map[k] || [k, 'muted']; return `<span class="badge ${c}">${esc(t)}</span>`; };

let toastT;
export function toast(msg, kind = 'ok') {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.append(el); }
  el.className = `show ${kind}`; el.textContent = msg;
  clearTimeout(toastT); toastT = setTimeout(() => { el.className = ''; }, kind === 'err' ? 6000 : 2800);
}

// executa uma ação async com feedback no botão
export async function busy(btn, fn) {
  const label = btn?.innerHTML; if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span>'; }
  try { return await fn(); }
  catch (e) { toast(e.message || String(e), 'err'); throw e; }
  finally { if (btn) { btn.disabled = false; btn.innerHTML = label; } }
}

export function confirmDialog(msg) { return window.confirm(msg); }

export function emptyState(title, text, action = '') {
  return `<div class="empty"><h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`;
}

export const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

// lê/escreve preferências leves (filtros) — opcional
export const pref = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(`inurse.${k}`)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`inurse.${k}`, JSON.stringify(v)); } catch { /* */ } },
};

export function downloadCSV(name, rows) {
  const csv = rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

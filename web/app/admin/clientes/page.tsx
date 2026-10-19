"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { sb, type Row } from "@/lib/admin/sb";
import { date, euro } from "@/lib/admin/format";
import { Card, Empty, ErrorBox, Loading, PageHead, Pager, useDebounced, useLoad } from "@/components/admin/ui";

const SIZE = 50;

export default function Customers() {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("total_spent_cents");
  const [news, setNews] = useState(false);
  const [page, setPage] = useState(0);
  const dq = useDebounced(q);
  const router = useRouter();
  const s = useLoad(async () => {
    let query = sb().from("customer_overview").select("*", { count: "exact" })
      .order(sort, { ascending: sort === "name", nullsFirst: false }).range(page * SIZE, page * SIZE + SIZE - 1);
    const t = dq.trim().replace(/[%,()]/g, " ");
    if (t) query = query.or(`email.ilike.%${t}%,name.ilike.%${t}%,phone.ilike.%${t}%,nif.ilike.%${t}%`);
    if (news) query = query.eq("newsletter", true);
    const { data, error, count } = await query;
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as Row[], total: count ?? 0 };
  }, [dq, sort, news, page]);

  async function exportCsv() {
    const { data } = await sb().from("customer_overview").select("name,email,phone,nif,newsletter,total_orders,total_spent_cents,last_order_at").order("email");
    const rows = (data ?? []) as Row[];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = ["Nome;Email;Telefone;NIF;Newsletter;Encomendas;Total gasto (€);Última encomenda",
      ...rows.map((r) => [r.name, r.email, r.phone, r.nif, r.newsletter ? "sim" : "não", r.total_orders, (r.total_spent_cents / 100).toFixed(2).replace(".", ","), r.last_order_at?.slice(0, 10)].map(esc).join(";"))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = "clientes-inurse.csv"; a.click();
  }

  return (
    <>
      <PageHead title="Clientes" sub="Inclui o histórico de compras trazido da loja CTT.">
        <button className="a-btn" onClick={exportCsv}>Exportar CSV</button>
      </PageHead>
      <div className="a-toolbar">
        <input type="search" placeholder="Nome, email, telefone ou NIF" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} aria-label="Pesquisar clientes" />
        <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(0); }} aria-label="Ordenar">
          <option value="total_spent_cents">Mais gastaram</option>
          <option value="total_orders">Mais encomendas</option>
          <option value="last_order_at">Compra mais recente</option>
          <option value="created_at">Mais recentes</option>
          <option value="name">Nome</option>
        </select>
        <label className="a-check"><input type="checkbox" checked={news} onChange={(e) => { setNews(e.target.checked); setPage(0); }} /> Só newsletter</label>
      </div>
      <Card className="flush">
        {s.error ? <ErrorBox error={s.error} retry={s.reload} /> : !s.data ? <Loading /> : s.data.rows.length === 0 ? <Empty title="Sem clientes" /> : (
          <>
            <div className="a-table-wrap">
              <table className="a-table">
                <thead><tr><th>Cliente</th><th>Telefone</th><th>NIF</th><th className="num">Encomendas</th><th className="num">Total gasto</th><th>Última compra</th></tr></thead>
                <tbody>
                  {s.data.rows.map((c) => (
                    <tr key={c.id} className="click" onClick={() => router.push(`/admin/clientes/${c.id}`)}>
                      <td><Link href={`/admin/clientes/${c.id}`} onClick={(e) => e.stopPropagation()}>{c.name || c.email}</Link>{c.name && <div className="a-small a-muted">{c.email}</div>}</td>
                      <td>{c.phone ?? "—"}</td>
                      <td>{c.nif ?? "—"}</td>
                      <td className="num">{c.total_orders}</td>
                      <td className="num">{euro(c.total_spent_cents)}</td>
                      <td className="a-muted">{date(c.last_order_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={page} size={SIZE} total={s.data.total} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}

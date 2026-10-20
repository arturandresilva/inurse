"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { sb, type Row } from "@/lib/admin/sb";
import { dateTime, euro, ORDER_STATUS, ORDER_TONE, PAYMENT } from "@/lib/admin/format";
import { Badge, Card, Empty, ErrorBox, Loading, PageHead, Pager, Tabs, useDebounced, useLoad } from "@/components/admin/ui";

const TABS: [string, string][] = [
  ["todo", "Por tratar"], ["pending_payment", "A aguardar pagamento"], ["shipped", "Enviadas"], ["all", "Todas"], ["closed", "Canceladas/reemb."],
];
const SIZE = 50;

export default function Orders() {
  const [tab, setTab] = useState("todo");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const dq = useDebounced(q);
  const router = useRouter();

  const s = useLoad(async () => {
    let query = sb().from("orders")
      .select("id,number,email,status,payment_method,total_cents,created_at,shipping_address,nif,admin_seen_at", { count: "exact" })
      .order("created_at", { ascending: tab === "todo" })
      .range(page * SIZE, page * SIZE + SIZE - 1);
    if (tab === "todo") query = query.or("status.in.(paid,processing),and(admin_seen_at.is.null,status.neq.cancelled)");
    else if (tab === "shipped") query = query.in("status", ["shipped", "delivered"]);
    else if (tab === "closed") query = query.in("status", ["cancelled", "refunded"]);
    else if (tab !== "all") query = query.eq("status", tab);
    const term = dq.trim().replace(/[%,()]/g, " ");
    if (term) {
      const n = Number(term.replace("#", ""));
      query = Number.isInteger(n) && n > 0 ? query.eq("number", n) : query.or(`email.ilike.%${term}%,nif.ilike.%${term}%`);
    }
    const { data, error, count } = await query;
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as Row[], total: count ?? 0 };
  }, [tab, dq, page]);

  return (
    <>
      <PageHead title="Encomendas" sub="As encomendas novas (ainda não abertas) e as pagas ficam em “Por tratar” até registares o envio." />
      <Tabs tabs={TABS} value={tab} onChange={(v) => { setTab(v); setPage(0); }} />
      <div className="a-toolbar">
        <input type="search" placeholder="Nº, email ou NIF" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} aria-label="Pesquisar encomendas" />
      </div>
      <Card className="flush">
        {s.error ? <ErrorBox error={s.error} retry={s.reload} /> : !s.data ? <Loading /> : s.data.rows.length === 0 ? (
          <Empty title={tab === "todo" ? "Nada por tratar" : "Sem encomendas"}>{tab === "todo" ? "Quando entrar uma encomenda, aparece aqui." : "Experimenta outro filtro."}</Empty>
        ) : (
          <>
            <div className="a-table-wrap">
              <table className="a-table">
                <thead><tr><th>Nº</th><th>Data</th><th>Cliente</th><th>Estado</th><th>Pagamento</th><th className="num">Total</th></tr></thead>
                <tbody>
                  {s.data.rows.map((o) => (
                    <tr key={o.id} className="click" onClick={() => router.push(`/admin/encomendas/${o.number}`)}>
                      <td><Link href={`/admin/encomendas/${o.number}`} onClick={(e) => e.stopPropagation()}>#{o.number}</Link>{!o.admin_seen_at && <> <Badge tone="warn">Nova</Badge></>}</td>
                      <td className="nowrap a-muted">{dateTime(o.created_at)}</td>
                      <td>{o.shipping_address?.name ?? "—"}<div className="a-small a-muted">{o.email}</div></td>
                      <td><Badge tone={ORDER_TONE[o.status]}>{ORDER_STATUS[o.status]}</Badge></td>
                      <td>{PAYMENT[o.payment_method] ?? "—"}</td>
                      <td className="num">{euro(o.total_cents)}</td>
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

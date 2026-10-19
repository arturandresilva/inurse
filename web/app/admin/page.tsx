"use client";
import Link from "next/link";
import { count, rpc, run, sb, type Row } from "@/lib/admin/sb";
import { ago, euro, euroN, isoDay, ORDER_STATUS, ORDER_TONE, PAYMENT } from "@/lib/admin/format";
import { Badge, Card, Empty, Loaded, PageHead, Stat, useLoad } from "@/components/admin/ui";

const SOLD = ["paid", "processing", "shipped", "delivered"];

async function load() {
  const c = sb();
  const now = new Date();
  const since30 = new Date(now.getTime() - 30 * 864e5).toISOString();
  const monthStart = isoDay(new Date(now.getFullYear(), now.getMonth(), 1));
  const [sales, todo, waiting, proposals, pl, settings, pickups, rules, linked, pages, rates] = await Promise.all([
    run(c.from("orders").select("total_cents,created_at").in("status", SOLD).gte("created_at", since30)),
    run(c.from("orders").select("id,number,email,status,total_cents,created_at,payment_method,shipping_address").in("status", ["paid", "processing"]).order("created_at").limit(20)),
    count("orders", (q) => q.eq("status", "pending_payment")),
    run(c.from("proposals").select("id,title,agent_key,priority,created_at").eq("status", "pending").order("created_at", { ascending: false }).limit(4)),
    rpc<Row>("profit_and_loss", { p_from: monthStart, p_to: isoDay(now) }).catch(() => null),
    run(c.from("settings").select("key,value")),
    count("pickup_addresses", (q) => q.eq("active", true)),
    count("pricing_rules", (q) => q.eq("active", true)),
    count("products", (q) => q.not("supplier_id", "is", null)),
    count("pages"),
    count("shipping_rates", (q) => q.eq("active", true)),
  ]);
  const s: Record<string, Row> = Object.fromEntries(settings.map((r) => [r.key, r.value]));
  const sum = (days: number) => {
    const t = now.getTime() - days * 864e5;
    const rows = sales.filter((o) => new Date(o.created_at).getTime() >= t);
    return { n: rows.length, cents: rows.reduce((a, o) => a + o.total_cents, 0) };
  };
  const today = sales.filter((o) => isoDay(new Date(o.created_at)) === isoDay(now));
  const setup = [
    { done: !!s["public.store"]?.email && !!s["public.store"]?.phone, label: "Contactos da loja (email e telefone)", href: "/admin/configuracoes" },
    { done: !!s["public.payments"]?.iban, label: "IBAN para pagamentos por transferência", href: "/admin/configuracoes?tab=pagamentos" },
    { done: pickups > 0, label: "Moradas de recolha e morada principal de devoluções", href: "/admin/envios?tab=moradas" },
    { done: rates > 0 && !!s["public.shipping"]?.rates_confirmed, label: "Confirmar tabela de portes por peso e zona", href: "/admin/envios" },
    { done: rules > 0, label: "Regra de preço (margem ou PVPR)", href: "/admin/precos" },
    { done: linked > 0, label: "Importar a tabela de preços da Nursing Care", href: "/admin/importar" },
    { done: pages > 0, label: "Páginas legais (envios, devoluções, termos, privacidade)", href: "/admin/paginas" },
    { done: !!s.ctt?.enabled, label: "Ligar a API CTT (etiquetas e recolhas)", href: "/admin/configuracoes?tab=ctt" },
  ];
  return { d7: sum(7), d30: sum(30), today: { n: today.length, cents: today.reduce((a, o) => a + o.total_cents, 0) }, todo, waiting, proposals, pl, setup };
}

export default function Dashboard() {
  const s = useLoad(load);
  return (
    <>
      <PageHead title="Painel" sub="O que precisa de atenção hoje e como está a correr a loja." />
      <Loaded s={s}>
        {(d) => {
          const pending = d.setup.filter((x) => !x.done);
          return (
            <>
              <div className="a-stats">
                <Stat label="Hoje" value={euro(d.today.cents)} hint={`${d.today.n} encomendas`} />
                <Stat label="Últimos 7 dias" value={euro(d.d7.cents)} hint={`${d.d7.n} encomendas`} />
                <Stat label="Últimos 30 dias" value={euro(d.d30.cents)} hint={`${d.d30.n} encomendas`} />
                <Stat label="Resultado do mês" value={d.pl ? euroN(d.pl.resultado_eur) : "—"}
                  tone={d.pl ? (d.pl.resultado_eur >= 0 ? "ok" : "err") : undefined}
                  hint={<Link href="/admin/contas">ver contas</Link>} />
                <Stat label="A aguardar pagamento" value={d.waiting} hint="encomendas" tone={d.waiting ? "warn" : undefined} />
              </div>

              {pending.length > 0 && (
                <Card title={`Preparar a loja (${d.setup.length - pending.length} de ${d.setup.length})`}>
                  <ul className="a-lines" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                    {d.setup.map((x) => (
                      <li key={x.label} className="a-line">
                        <span>{x.done ? "✓ " : "○ "}<span className={x.done ? "a-muted" : ""}>{x.label}</span></span>
                        {!x.done && <Link className="a-btn sm" href={x.href}>Tratar</Link>}
                      </li>
                    ))}
                  </ul>
                </Card>
              )}

              <div className="a-cols">
                <Card title="Encomendas para tratar" actions={<Link className="a-btn sm" href="/admin/encomendas">Todas</Link>} className="flush">
                  {d.todo.length === 0 ? <Empty title="Nada por tratar">As encomendas pagas aparecem aqui até serem enviadas.</Empty> : (
                    <div className="a-table-wrap">
                      <table className="a-table">
                        <thead><tr><th>Nº</th><th>Cliente</th><th>Estado</th><th>Pagamento</th><th className="num">Total</th><th>Recebida</th></tr></thead>
                        <tbody>
                          {d.todo.map((o) => (
                            <tr key={o.id}>
                              <td><Link href={`/admin/encomendas/${o.number}`}>#{o.number}</Link></td>
                              <td>{o.shipping_address?.name ?? o.email}</td>
                              <td><Badge tone={ORDER_TONE[o.status]}>{ORDER_STATUS[o.status]}</Badge></td>
                              <td>{PAYMENT[o.payment_method] ?? "—"}</td>
                              <td className="num">{euro(o.total_cents)}</td>
                              <td className="a-muted nowrap">{ago(o.created_at)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
                <Card title="Propostas da equipa" actions={<Link className="a-btn sm" href="/admin/agentes">Ver todas</Link>}>
                  {d.proposals.length === 0 ? <p className="a-muted">Sem propostas por decidir.</p> : (
                    <ul className="a-lines" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                      {d.proposals.map((p) => (
                        <li key={p.id} className="a-line">
                          <Link href={`/admin/agentes#${p.id}`}>{p.title}</Link>
                          <Badge tone={p.priority === "alta" ? "warn" : "muted"}>{p.priority}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>
            </>
          );
        }}
      </Loaded>
    </>
  );
}

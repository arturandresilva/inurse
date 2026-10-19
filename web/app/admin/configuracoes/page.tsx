"use client";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { run, sb, type Row } from "@/lib/admin/sb";
import { fromCents, toCents } from "@/lib/admin/format";
import { Alert, Card, Confirm, Field, Loaded, PageHead, Tabs, useAction, useLoad } from "@/components/admin/ui";

async function load() {
  const c = sb();
  const [settings, admins, invites] = await Promise.all([
    run(c.from("settings").select("key,value")),
    run(c.from("admins").select("user_id,email,created_at")),
    run(c.from("admin_invites").select("*")),
  ]);
  return { s: Object.fromEntries(settings.map((r) => [r.key, r.value])) as Record<string, Row>, admins, invites };
}

export default function SettingsPage() {
  return <Suspense><Settings /></Suspense>;
}

function Settings() {
  const params = useSearchParams();
  const [tab, setTab] = useState(params.get("tab") ?? "loja");
  const st = useLoad(load);
  const { busy, act } = useAction();

  const save = (key: string, value: Row, msg = "Guardado.") => act(async () => {
    const cur = st.data?.s[key] ?? {};
    const { error } = await sb().from("settings").upsert({ key, value: { ...cur, ...value }, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    await st.reload();
  }, msg);
  const form = (e: React.FormEvent<HTMLFormElement>) => { e.preventDefault(); return new FormData(e.currentTarget); };

  return (
    <>
      <PageHead title="Configurações" />
      <Tabs tabs={[["loja", "Loja"], ["pagamentos", "Pagamentos"], ["ctt", "CTT"], ["faturacao", "Faturação"], ["agentes", "Agentes IA"], ["acessos", "Acessos"]]} value={tab} onChange={setTab} />
      <Loaded s={st}>
        {({ s, admins, invites }) => (
          <>
            {tab === "loja" && (
              <Card title="Dados da loja">
                <form onSubmit={(e) => { const f = form(e); save("public.store", { name: f.get("name"), email: f.get("email"), phone: f.get("phone"), domain: f.get("domain"), return_days: Number(f.get("return_days")) || 14 }); }}>
                  <div className="a-form">
                    <Field label="Nome"><input name="name" defaultValue={s["public.store"]?.name ?? "iNurse"} /></Field>
                    <Field label="Email de contacto" hint="Aparece na loja e nos emails aos clientes"><input name="email" type="email" defaultValue={s["public.store"]?.email ?? ""} /></Field>
                    <Field label="Telefone"><input name="phone" defaultValue={s["public.store"]?.phone ?? ""} /></Field>
                    <Field label="Domínio"><input name="domain" defaultValue={s["public.store"]?.domain ?? "www.inurse.pt"} /></Field>
                    <Field label="Prazo para pedir devolução (dias)"><input name="return_days" type="number" min={14} defaultValue={s["public.store"]?.return_days ?? 14} /></Field>
                  </div>
                  <div className="a-formfoot"><button className="a-btn primary" disabled={busy}>Guardar</button></div>
                </form>
              </Card>
            )}

            {tab === "pagamentos" && (
              <>
                <Card title="Métodos de pagamento">
                  <Alert tone="warn">MB WAY e Multibanco precisam de um prestador (ifthenpay ou Eupago) para gerar referências e confirmar o pagamento sozinhos. Até lá, deixa só a transferência ativa.</Alert>
                  <form onSubmit={(e) => { const f = form(e); save("public.payments", { mbway: f.get("mbway") === "on", multibanco: f.get("multibanco") === "on", transfer: f.get("transfer") === "on", iban: String(f.get("iban") ?? "").replace(/\s/g, "").toUpperCase(), holder: f.get("holder") }); }}>
                    <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
                      <label className="a-check"><input type="checkbox" name="transfer" defaultChecked={!!s["public.payments"]?.transfer} /> Transferência bancária</label>
                      <label className="a-check"><input type="checkbox" name="mbway" defaultChecked={!!s["public.payments"]?.mbway} /> MB WAY</label>
                      <label className="a-check"><input type="checkbox" name="multibanco" defaultChecked={!!s["public.payments"]?.multibanco} /> Multibanco</label>
                    </div>
                    <div className="a-form">
                      <Field label="IBAN para transferências"><input name="iban" defaultValue={s["public.payments"]?.iban ?? ""} placeholder="PT50 …" /></Field>
                      <Field label="Titular da conta"><input name="holder" defaultValue={s["public.payments"]?.holder ?? ""} /></Field>
                    </div>
                    <div className="a-formfoot"><button className="a-btn primary" disabled={busy}>Guardar</button></div>
                  </form>
                </Card>
                <Card title="Comissões e custos por encomenda (para o Contabilista)">
                  <form onSubmit={(e) => {
                    const f = form(e); const fees: Row = {};
                    for (const m of ["mbway", "multibanco", "transfer"]) fees[m] = { pct: Number(String(f.get(`${m}_pct`)).replace(",", ".")) || 0, fixed_cents: toCents(String(f.get(`${m}_fixed`))) ?? 0 };
                    save("finance", { payment_fees: fees, packaging_cents_per_order: toCents(String(f.get("packaging"))) ?? 0 });
                  }}>
                    <table className="a-table" style={{ maxWidth: 520 }}>
                      <thead><tr><th>Método</th><th>% do valor</th><th>Fixo por pagamento (€)</th></tr></thead>
                      <tbody>{[["mbway", "MB WAY"], ["multibanco", "Multibanco"], ["transfer", "Transferência"]].map(([k, l]) => (
                        <tr key={k}><td>{l}</td>
                          <td><input className="small" name={`${k}_pct`} inputMode="decimal" defaultValue={s.finance?.payment_fees?.[k]?.pct ?? 0} /></td>
                          <td><input className="money" name={`${k}_fixed`} inputMode="decimal" defaultValue={fromCents(s.finance?.payment_fees?.[k]?.fixed_cents ?? 0)} /></td></tr>
                      ))}</tbody>
                    </table>
                    <div className="a-form" style={{ marginTop: 12 }}>
                      <Field label="Embalagem por encomenda (€, s/IVA)" hint="0 se o fornecedor embala"><input name="packaging" inputMode="decimal" defaultValue={fromCents(s.finance?.packaging_cents_per_order ?? 0)} /></Field>
                    </div>
                    <div className="a-formfoot"><button className="a-btn primary" disabled={busy}>Guardar</button></div>
                  </form>
                </Card>
              </>
            )}

            {tab === "ctt" && (
              <Card title="CTT Expresso (etiquetas, recolhas e devolução fácil)">
                <Alert tone={s.ctt?.enabled ? "ok" : "info"}>
                  {s.ctt?.enabled ? "Ligação ativa." : "As credenciais da API (Identificação de utilizador e Chave única do cliente, no backoffice CTT) ficam nos segredos das Edge Functions do Supabase, com os nomes CTT_USER_ID e CTT_AUTH_ID — nunca aqui. Depois ativa a integração."}
                </Alert>
                <form onSubmit={(e) => { const f = form(e); save("ctt", { enabled: f.get("enabled") === "on", client_id: f.get("client_id"), contract_id: f.get("contract_id"), contract_account: f.get("contract_account"), service: f.get("service"), return_service: f.get("return_service"), sender_name: f.get("sender_name"), sender_email: f.get("sender_email"), sender_phone: f.get("sender_phone") }); }}>
                  <div className="a-form">
                    <Field label="Nº de cliente CTT"><input name="client_id" defaultValue={s.ctt?.client_id ?? ""} /></Field>
                    <Field label="Nº de contrato"><input name="contract_id" defaultValue={s.ctt?.contract_id ?? ""} /></Field>
                    <Field label="Nº da conta contrato"><input name="contract_account" defaultValue={s.ctt?.contract_account ?? ""} /></Field>
                    <Field label="Serviço para envios"><select name="service" defaultValue={s.ctt?.service ?? "EMSF057.01"}>
                      {((s.ctt?.services as Row[] | undefined) ?? [{ code: "EMSF057.01", name: "Em 2 dias" }]).filter((x) => !x.returns).map((x) => <option key={x.code} value={x.code}>{x.code} — {x.name}</option>)}
                    </select></Field>
                    <Field label="Serviço para devoluções"><select name="return_service" defaultValue={s.ctt?.return_service ?? "EMSF053.01"}>
                      {((s.ctt?.services as Row[] | undefined) ?? [{ code: "EMSF053.01", name: "Devolução Fácil" }]).map((x) => <option key={x.code} value={x.code}>{x.code} — {x.name}</option>)}
                    </select></Field>
                    <Field label="Remetente (nome)"><input name="sender_name" defaultValue={s.ctt?.sender_name ?? "iNurse"} /></Field>
                    <Field label="Remetente (email)"><input name="sender_email" type="email" defaultValue={s.ctt?.sender_email ?? ""} /></Field>
                    <Field label="Remetente (telefone)"><input name="sender_phone" defaultValue={s.ctt?.sender_phone ?? ""} /></Field>
                  </div>
                  <label className="a-check" style={{ marginTop: 12 }}><input type="checkbox" name="enabled" defaultChecked={!!s.ctt?.enabled} /> Ativar a integração (só depois de guardares CTT_USER_ID e CTT_AUTH_ID)</label>
                  <div className="a-formfoot"><button className="a-btn primary" disabled={busy}>Guardar</button></div>
                </form>
              </Card>
            )}

            {tab === "faturacao" && (
              <Card title="InvoiceXpress">
                <Alert tone="info">A chave da API do InvoiceXpress fica nos segredos das Edge Functions do Supabase (INVOICEXPRESS_API_KEY), nunca aqui. Com ela ligada, cada encomenda paga gera a fatura-recibo e o PDF fica na encomenda.</Alert>
                <form onSubmit={(e) => { const f = form(e); save("invoicing", { provider: "invoicexpress", account: String(f.get("account") ?? "").trim(), auto_invoice: f.get("auto_invoice") === "on", sequence: f.get("sequence") }); }}>
                  <div className="a-form">
                    <Field label="Nome da conta" hint="O que aparece antes de .app.invoicexpress.com"><input name="account" defaultValue={s.invoicing?.account ?? ""} /></Field>
                    <Field label="Série (opcional)"><input name="sequence" defaultValue={s.invoicing?.sequence ?? ""} /></Field>
                  </div>
                  <label className="a-check" style={{ marginTop: 12 }}><input type="checkbox" name="auto_invoice" defaultChecked={s.invoicing?.auto_invoice !== false} /> Emitir fatura automaticamente quando a encomenda é paga</label>
                  <div className="a-formfoot"><button className="a-btn primary" disabled={busy}>Guardar</button></div>
                </form>
              </Card>
            )}

            {tab === "agentes" && (
              <Card title="Regras para a equipa IA">
                <form onSubmit={(e) => { const f = form(e); save("agents", { monthly_budget_usd: Number(f.get("budget")) || 0, brand_voice: f.get("brand_voice"), max_discount_pct: Number(f.get("max_discount")) || 0, min_margin_pct: Number(f.get("min_margin")) || 0 }); }}>
                  <div className="a-form">
                    <Field label="Orçamento mensal (USD)" hint="Os agentes param ao atingir"><input name="budget" type="number" min={0} defaultValue={s.agents?.monthly_budget_usd ?? 15} /></Field>
                    <Field label="Desconto máximo que podem propor (%)"><input name="max_discount" type="number" min={0} max={90} defaultValue={s.agents?.max_discount_pct ?? 20} /></Field>
                    <Field label="Margem mínima (%)" hint="Nenhuma proposta de preço pode ficar abaixo"><input name="min_margin" type="number" min={0} max={90} defaultValue={s.agents?.min_margin_pct ?? 25} /></Field>
                    <Field label="Tom de voz da marca" wide><textarea name="brand_voice" rows={3} defaultValue={s.agents?.brand_voice ?? ""} /></Field>
                  </div>
                  <div className="a-formfoot"><button className="a-btn primary" disabled={busy}>Guardar</button></div>
                </form>
              </Card>
            )}

            {tab === "acessos" && (
              <Card title="Quem gere a loja">
                <table className="a-table" style={{ marginBottom: 14 }}>
                  <thead><tr><th>Administrador</th><th></th></tr></thead>
                  <tbody>{admins.map((a) => <tr key={a.user_id}><td>{a.email}</td><td className="a-muted a-small">ativo</td></tr>)}
                    {invites.filter((i) => !admins.some((a) => a.email.toLowerCase() === String(i.email).toLowerCase())).map((i) => (
                      <tr key={i.email}><td>{i.email}</td><td className="nowrap"><span className="a-muted a-small">convidado: cria a conta com este email</span>{" "}
                        <Confirm className="a-btn sm danger" text={`Retirar o convite a ${i.email}?`} onYes={() => act(async () => { await run(sb().from("admin_invites").delete().eq("email", i.email)); await st.reload(); }, "Convite retirado.")}>Retirar</Confirm></td></tr>
                    ))}</tbody>
                </table>
                <form className="a-inline" onSubmit={(e) => {
                  const f = form(e); const email = String(f.get("email") ?? "").trim().toLowerCase();
                  act(async () => { await run(sb().from("admin_invites").insert({ email })); (e.target as HTMLFormElement).reset(); await st.reload(); }, "Convite criado.");
                }}>
                  <input name="email" type="email" placeholder="email@exemplo.pt" required style={{ maxWidth: 300 }} aria-label="Email a convidar" />
                  <button className="a-btn" disabled={busy}>Convidar administrador</button>
                </form>
                <p className="a-hint" style={{ marginTop: 8 }}>Quem for convidado passa a ter acesso total ao backoffice quando criar conta com esse email.</p>
              </Card>
            )}
          </>
        )}
      </Loaded>
    </>
  );
}

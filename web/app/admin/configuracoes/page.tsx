"use client";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { callFunction, run, sb, type Row } from "@/lib/admin/sb";
import { fromCents, toCents } from "@/lib/admin/format";
import { Alert, Card, Confirm, Field, Loaded, PageHead, Tabs, useAction, useLoad } from "@/components/admin/ui";
import { MaintenanceCard } from "@/components/admin/Maintenance";
import KeysCard from "@/components/admin/KeysCard";

async function load() {
  const c = sb();
  const [settings, admins, invites, outbox] = await Promise.all([
    run(c.from("settings").select("key,value")),
    run(c.from("admins").select("user_id,email,created_at")),
    run(c.from("admin_invites").select("*")),
    run(c.from("email_outbox").select("id,kind,to_email,status,send_after,sent_at,error,orders(number)").order("created_at", { ascending: false }).limit(25)),
  ]);
  return { s: Object.fromEntries(settings.map((r) => [r.key, r.value])) as Record<string, Row>, admins, invites, outbox };
}

export default function SettingsPage() {
  return <Suspense><Settings /></Suspense>;
}

function Settings() {
  const params = useSearchParams();
  const [tab, setTab] = useState(params.get("tab") ?? "loja");
  const st = useLoad(load);
  const { busy, act } = useAction();
  const [ixCheck, setIxCheck] = useState<Row | null>(null);

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
      <Tabs tabs={[["loja", "Loja"], ["pagamentos", "Pagamentos"], ["ctt", "CTT"], ["faturacao", "Faturação"], ["email", "Emails"], ["agentes", "Agentes IA"], ["acessos", "Acessos"]]} value={tab} onChange={setTab} />
      <Loaded s={st}>
        {({ s, admins, invites, outbox }) => (
          <>
            {tab === "loja" && (() => {
              const st0 = s["public.store"] ?? {};
              const v = (k: string, d = "") => String(st0[k] ?? d);
              return (
              <>
              <MaintenanceCard />
              <KeysCard />
              <Card title="Marca e logótipos"><p className="a-hint">Logótipo, ícone, cores, letra e regras de uso, com todos os ficheiros para descarregar (site, redes sociais, impressão).</p>
                <div className="a-formfoot" style={{ justifyContent: "flex-start" }}><a className="a-btn" href="/marca/guia.html" target="_blank" rel="noopener">Abrir o guia de marca</a><a className="a-btn" href="/marca/inurse-marca.zip" download>Descarregar o pack (.zip)</a></div></Card>
              <Card title="Dados da loja">
                <form onSubmit={(e) => { const f = form(e); save("public.store", { name: f.get("name"), email: String(f.get("email") ?? "").trim(), phone: String(f.get("phone") ?? "").trim(), domain: f.get("domain"), return_days: Math.max(14, Number(f.get("return_days")) || 14) }); }}>
                  <div className="a-form">
                    <Field label="Nome da loja"><input name="name" defaultValue={v("name", "iNurse")} /></Field>
                    <Field label="Email de contacto" hint="Aparece na loja, nas páginas legais e nos emails aos clientes"><input name="email" type="email" defaultValue={v("email")} /></Field>
                    <Field label="Telefone"><input name="phone" defaultValue={v("phone")} /></Field>
                    <Field label="Domínio"><input name="domain" defaultValue={v("domain", "www.inurse.pt")} /></Field>
                    <Field label="Prazo de livre resolução e devolução (dias)" hint="Mínimo legal: 14"><input name="return_days" type="number" min={14} defaultValue={v("return_days", "14")} /></Field>
                  </div>
                  <div className="a-formfoot"><button className="a-btn primary" disabled={busy}>Guardar</button></div>
                </form>
              </Card>
              <Card title="Traduções (inglês, espanhol e francês)">
                <p className="a-hint" style={{ marginBottom: 12 }}>Os textos fixos da loja já estão traduzidos. As descrições dos produtos, as categorias e as páginas (termos, privacidade…) são traduzidas pelo agente Tradutor todas as noites, só o que é novo ou mudou. Conta para o orçamento mensal da IA.</p>
                <button type="button" className="a-btn" disabled={busy} onClick={() => act(async () => {
                  const r = await callFunction<Row>("agentes", { agent: "tradutor" });
                  if (r?.skipped) throw new Error(r.reason);
                  return r;
                }, "Tradução feita. Se faltar alguma coisa, continua na próxima execução.")}>Traduzir agora</button>
              </Card>
              <Card title="Dados legais">
                <p className="a-hint" style={{ marginBottom: 12 }}>Usados nos Termos e Condições, Privacidade, Contactos, livre resolução e emails aos clientes. Ao corrigir aqui, muda em todo o site (pode demorar até 10 minutos a aparecer).</p>
                <form onSubmit={(e) => { const f = form(e); const g = (k: string) => String(f.get(k) ?? "").trim();
                  save("public.store", { legal_name: g("legal_name"), nif: g("nif").replace(/\D/g, ""), address: g("address"), zip: g("zip"), city: g("city"),
                    ral_name: g("ral_name"), ral_url: g("ral_url"), ral_address: g("ral_address") }, "Dados legais guardados."); }}>
                  <div className="a-form">
                    <Field label="Nome ou empresa (titular)"><input name="legal_name" defaultValue={v("legal_name", "Artur Silva")} /></Field>
                    <Field label="NIF"><input name="nif" inputMode="numeric" defaultValue={v("nif", "226720462")} /></Field>
                    <Field label="Morada (rua e número)" wide><input name="address" defaultValue={v("address", "Praça 20 de Maio")} /></Field>
                    <Field label="Código postal"><input name="zip" defaultValue={v("zip", "4590-182")} /></Field>
                    <Field label="Localidade"><input name="city" defaultValue={v("city", "Paços de Ferreira")} /></Field>
                  </div>
                  <h3 style={{ margin: "18px 0 8px" }}>Resolução alternativa de litígios</h3>
                  <div className="a-form">
                    <Field label="Entidade" wide><input name="ral_name" defaultValue={v("ral_name", "CNIACC – Centro Nacional de Informação e Arbitragem de Conflitos de Consumo")} /></Field>
                    <Field label="Site"><input name="ral_url" defaultValue={v("ral_url", "https://www.cniacc.pt")} /></Field>
                    <Field label="Morada da entidade (opcional)" wide><input name="ral_address" defaultValue={v("ral_address")} /></Field>
                  </div>
                  <div className="a-formfoot"><button className="a-btn primary" disabled={busy}>Guardar dados legais</button></div>
                </form>
              </Card>
              </>
              );
            })()}

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

            {tab === "email" && (() => {
              const e0 = s.email ?? {};
              const KINDS: [string, string][] = [["encomenda_recebida", "Encomenda recebida (com dados de pagamento)"], ["encomenda_paga", "Pagamento confirmado"],
                ["encomenda_preparacao", "Em preparação"], ["encomenda_enviada", "Enviada (com código de seguimento)"], ["encomenda_entregue", "Entregue"],
                ["encomenda_cancelada", "Cancelada"], ["encomenda_reembolsada", "Reembolsada"], ["avaliacao", "Pedido de avaliação depois da entrega"]];
              const ST: Record<string, string> = { pending: "na fila", sent: "enviado", skipped: "não enviado", error: "falhou" };
              return (
              <>
              <Card title="Emails aos clientes">
                <Alert tone="info">Os emails saem pelo Resend (resend.com, gratuito até 3000 por mês). Cria a conta, verifica o domínio inurse.pt (o Resend indica os registos DNS a pôr no domínio) e guarda a chave da API nos segredos das Edge Functions do Supabase com o nome RESEND_API_KEY.</Alert>
                <form onSubmit={(ev) => { const f = form(ev); const g = (k: string) => String(f.get(k) ?? "").trim();
                  save("email", { enabled: f.get("enabled") === "on", from: g("from"), reply_to: g("reply_to"), site_url: g("site_url"),
                    review_delay_hours: Math.max(1, Number(f.get("review_delay_hours")) || 24),
                    kinds: Object.fromEntries(KINDS.map(([k]) => [k, f.get(`k_${k}`) === "on"])) }); }}>
                  <div className="a-form">
                    <Field label="Remetente" hint='Ex.: iNurse <info@inurse.pt> (o domínio tem de estar verificado no Resend)'><input name="from" defaultValue={e0.from ?? "iNurse <info@inurse.pt>"} /></Field>
                    <Field label="Responder para"><input name="reply_to" type="email" defaultValue={e0.reply_to ?? "info@inurse.pt"} /></Field>
                    <Field label="Endereço do site nos links" hint="Mudar para https://www.inurse.pt quando o domínio apontar para a loja nova"><input name="site_url" defaultValue={e0.site_url ?? "https://www.inurse.pt"} /></Field>
                    <Field label="Pedido de avaliação: horas depois da entrega"><input name="review_delay_hours" type="number" min={1} defaultValue={e0.review_delay_hours ?? 24} /></Field>
                  </div>
                  <h3 style={{ margin: "16px 0 8px" }}>Que emails enviar</h3>
                  <div style={{ display: "grid", gap: 4 }}>
                    {KINDS.map(([k, l]) => <label key={k} className="a-check"><input type="checkbox" name={`k_${k}`} defaultChecked={e0.kinds?.[k] !== false} /> {l}</label>)}
                  </div>
                  <label className="a-check" style={{ marginTop: 14 }}><input type="checkbox" name="enabled" defaultChecked={!!e0.enabled} /> <strong>Ligar o envio de emails</strong></label>
                  {e0.active_since && <p className="a-hint">Ligado desde {new Date(e0.active_since).toLocaleString("pt-PT")}. Emails de encomendas anteriores não são enviados.</p>}
                  <div className="a-formfoot">
                    <button type="button" className="a-btn" disabled={busy} onClick={() => {
                      const to = window.prompt("Enviar um exemplo de cada email para:", s["public.store"]?.email || "info@inurse.pt");
                      if (to) act(() => callFunction("emails", { mode: "test", to }), `Exemplos enviados para ${to}.`);
                    }}>Enviar exemplos</button>
                    <button className="a-btn primary" disabled={busy}>Guardar</button>
                  </div>
                </form>
              </Card>
              <Card title="Últimos emails">
                {outbox.length ? (
                  <div className="a-table-wrap"><table className="a-table"><thead><tr><th>Encomenda</th><th>Email</th><th>Para</th><th>Estado</th><th>Quando</th></tr></thead>
                    <tbody>{outbox.map((o: Row) => (
                      <tr key={o.id}><td>#{o.orders?.number ?? "—"}</td><td>{KINDS.find(([k]) => k === o.kind)?.[1] ?? o.kind}</td><td>{o.to_email}</td>
                        <td title={o.error ?? ""}>{ST[o.status] ?? o.status}{o.error ? " ⚠" : ""}</td>
                        <td>{new Date(o.sent_at ?? o.send_after).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" })}</td></tr>))}</tbody></table></div>
                ) : <p className="a-muted">Ainda não há emails na fila.</p>}
              </Card>
              </>
              );
            })()}

            {tab === "faturacao" && (
              <Card title="InvoiceXpress">
                <Alert tone="info">A chave da API do InvoiceXpress fica nos segredos das Edge Functions do Supabase com o nome INVOICEXPRESS_API_KEY, nunca aqui. Com a emissão automática ligada, cada encomenda paga gera a fatura-recibo (em até 10 minutos, ou logo ao marcares como paga), o PDF fica na encomenda e na área do cliente, e o InvoiceXpress envia-a ao cliente por email.</Alert>
                <form onSubmit={(e) => { const f = form(e); save("invoicing", { ...(s.invoicing ?? {}), provider: "invoicexpress", account: String(f.get("account") ?? "").trim(), auto_invoice: f.get("auto_invoice") === "on", send_email: f.get("send_email") === "on", sequence: String(f.get("sequence") ?? "").trim() }); }}>
                  <div className="a-form">
                    <Field label="Nome da conta" hint="O que aparece antes de .app.invoicexpress.com"><input name="account" defaultValue={s.invoicing?.account ?? ""} /></Field>
                    <Field label="Série (opcional)" hint="Vazio usa a série por defeito. Usa “Testar ligação” para ver os números das séries."><input name="sequence" inputMode="numeric" defaultValue={s.invoicing?.sequence ?? ""} /></Field>
                  </div>
                  <label className="a-check" style={{ marginTop: 12 }}><input type="checkbox" name="auto_invoice" defaultChecked={s.invoicing?.auto_invoice !== false} /> Emitir fatura automaticamente quando a encomenda é paga</label>
                  <label className="a-check"><input type="checkbox" name="send_email" defaultChecked={s.invoicing?.send_email !== false} /> Enviar a fatura ao cliente por email (pelo InvoiceXpress)</label>
                  {s.invoicing?.active_since && <p className="a-hint">Emissão automática ativa desde {new Date(s.invoicing.active_since).toLocaleString("pt-PT")}. Encomendas pagas antes disso faturam-se a partir da própria encomenda.</p>}
                  <div className="a-formfoot">
                    <button type="button" className="a-btn" disabled={busy} onClick={() => act(async () => {
                      const r = await callFunction<Row>("faturas", { mode: "check" });
                      setIxCheck(r);
                    }, "Ligação ao InvoiceXpress a funcionar.")}>Testar ligação</button>
                    <button className="a-btn primary" disabled={busy}>Guardar</button>
                  </div>
                </form>
                {ixCheck && (
                  <div style={{ marginTop: 12 }}>
                    <p>Conta <strong>{ixCheck.account}</strong> ligada. Séries disponíveis:</p>
                    <ul>{(ixCheck.sequences ?? []).map((q: Row) => <li key={q.id}>Série {q.serie} — número <code>{q.id}</code>{q.default ? " (por defeito)" : ""}</li>)}</ul>
                  </div>
                )}
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

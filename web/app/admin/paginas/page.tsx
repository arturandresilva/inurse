"use client";
import { useState } from "react";
import { run, sb, type Row } from "@/lib/admin/sb";
import { dateTime } from "@/lib/admin/format";
import { legalDrafts } from "@/lib/admin/legal-pages";
import { slugify } from "@/lib/format";
import { Alert, Badge, Card, Confirm, Empty, Field, Loaded, Modal, PageHead, useAction, useLoad } from "@/components/admin/ui";

export default function Pages() {
  const s = useLoad(async () => {
    const [pages, store] = await Promise.all([
      run(sb().from("pages").select("*").order("title")),
      run<Row | null>(sb().from("settings").select("value").eq("key", "public.store").maybeSingle()),
    ]);
    return { pages, store: (store?.value ?? {}) as Row };
  });
  const [edit, setEdit] = useState<Row | null>(null);
  const { busy, act } = useAction();

  return (
    <>
      <PageHead title="Páginas" sub="Páginas informativas da loja (rodapé): envios, trocas, tamanhos, contactos, termos e privacidade.">
        <button className="a-btn primary" onClick={() => setEdit({ published: true })}>Nova página</button>
      </PageHead>
      <Loaded s={s}>
        {({ pages, store }) => {
          const missing = legalDrafts(store).filter((dr) => !pages.some((p) => p.slug === dr.slug));
          return (
            <>
              {missing.length > 0 && (
                <Alert tone="warn">
                  Faltam {missing.length} páginas a que o rodapé da loja liga ({missing.map((m) => m.title).join(", ")}).
                  <button className="a-btn sm" disabled={busy} onClick={() => act(async () => {
                    await run(sb().from("pages").insert(missing.map((m) => ({ ...m, published: false }))));
                    await s.reload();
                  }, "Rascunhos criados. Preenche os campos entre [ ] e publica.")}>Criar rascunhos</button>
                </Alert>
              )}
              <Card className="flush">
                {pages.length === 0 ? <Empty title="Sem páginas" /> : (
                  <table className="a-table">
                    <thead><tr><th>Página</th><th>Endereço</th><th>Estado</th><th>Atualizada</th><th></th></tr></thead>
                    <tbody>{pages.map((p) => {
                      const todo = /\[[^\]]+\]/.test(p.body_html);
                      return (
                        <tr key={p.id}>
                          <td><strong>{p.title}</strong></td>
                          <td><a href={`/p/${p.slug}`} target="_blank" rel="noreferrer">/p/{p.slug}</a></td>
                          <td><Badge tone={p.published ? "ok" : "muted"}>{p.published ? "Publicada" : "Rascunho"}</Badge>{todo && <> <Badge tone="warn">tem campos por preencher</Badge></>}</td>
                          <td className="a-small a-muted">{dateTime(p.updated_at)}</td>
                          <td><button className="a-btn sm" onClick={() => setEdit(p)}>Editar</button></td>
                        </tr>
                      );
                    })}</tbody>
                  </table>
                )}
              </Card>
            </>
          );
        }}
      </Loaded>
      <Modal title={edit?.id ? `Editar: ${edit.title}` : "Nova página"} open={!!edit} onClose={() => setEdit(null)} wide>
        {edit && (
          <form onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const g = (k: string) => String(f.get(k) ?? "").trim();
            const row = { title: g("title"), slug: slugify(g("slug") || g("title")), body_html: g("body_html"), seo_title: g("seo_title") || null,
              seo_description: g("seo_description") || null, published: f.get("published") === "on", updated_at: new Date().toISOString() };
            act(async () => {
              if (row.published && /\[[^\]]+\]/.test(row.body_html)) throw new Error("Ainda há campos entre [ ] por preencher.");
              if (edit.id) await run(sb().from("pages").update(row).eq("id", edit.id));
              else await run(sb().from("pages").insert(row));
              setEdit(null); await s.reload();
            }, "Página guardada.");
          }}>
            <div className="a-grid-2">
              <Field label="Título"><input name="title" defaultValue={edit.title ?? ""} required /></Field>
              <Field label="Endereço (/p/…)"><input name="slug" defaultValue={edit.slug ?? ""} placeholder="gerado a partir do título" /></Field>
              <Field label="Conteúdo (HTML simples)" wide hint="Campos entre [ ] são para preencher. Use <h2>, <p>, <ul><li>, <strong>, <a href>."><textarea name="body_html" rows={16} defaultValue={edit.body_html ?? ""} style={{ fontFamily: "ui-monospace, monospace", fontSize: ".85rem" }} /></Field>
              <Field label="Título Google"><input name="seo_title" defaultValue={edit.seo_title ?? ""} /></Field>
              <Field label="Descrição Google"><input name="seo_description" defaultValue={edit.seo_description ?? ""} /></Field>
            </div>
            <label className="a-check" style={{ marginTop: 12 }}><input type="checkbox" name="published" defaultChecked={!!edit.published} /> Publicada</label>
            <div className="a-formfoot">
              {edit.id && <Confirm className="a-btn danger" text="Apagar esta página?" onYes={() => act(async () => { await run(sb().from("pages").delete().eq("id", edit.id)); setEdit(null); await s.reload(); }, "Página apagada.")}>Apagar</Confirm>}
              <button className="a-btn primary" disabled={busy}>Guardar</button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}

"use client";
import Link from "next/link";
import { callFunction, run, sb, type Row } from "@/lib/admin/sb";
import { Alert, Badge, Card, Field, Loaded, PageHead, useAction, useLoad } from "@/components/admin/ui";

const PROFILES: [string, string, string][] = [
  ["instagram", "Instagram", "https://www.instagram.com/inurse.pt"],
  ["facebook", "Facebook", "https://www.facebook.com/inurse.pt"],
  ["tiktok", "TikTok", "https://www.tiktok.com/@inurse.pt"],
  ["pinterest", "Pinterest", "https://pinterest.com/inurse"],
  ["youtube", "YouTube", "https://www.youtube.com/@inurse"],
];

// canais que fazem sentido para calçado e meias de uso profissional (saúde, restauração, quem passa o dia de pé)
const CHANNELS: { name: string; fit: "alta" | "média"; how: string; why: string }[] = [
  { name: "Instagram", fit: "alta", how: "Publicação direta daqui (depois de ligar)", why: "É onde enfermeiros e estudantes de saúde seguem marcas de farda e calçado. Fotos de produto, Reels do dia a dia no turno, Stories com promoções. Dá para marcar produtos com o Instagram Shopping, a partir do catálogo." },
  { name: "Facebook", fit: "alta", how: "Publicação direta daqui (depois de ligar)", why: "Público um pouco mais velho (enfermeiros e auxiliares com mais anos de serviço) e grupos de profissionais de saúde. A mesma publicação do Instagram pode sair na página." },
  { name: "TikTok", fit: "alta", how: "Descarregar imagem e copiar texto (por agora)", why: "Muito forte em #nursetok e vídeos de rotina de turno. Vídeos curtos verticais a mostrar as socas e as meias em uso funcionam melhor que fotos. A publicação automática exige uma app aprovada pelo TikTok." },
  { name: "Pinterest", fit: "média", how: "Descarregar imagem e copiar texto", why: "Pesquisas de ‘nurse outfit’, ‘scrubs’ e conforto. Os pins duram meses e trazem visitas ao site; bom para guias de tamanhos e conjuntos." },
  { name: "Google Shopping (Merchant Center)", fit: "alta", how: "Feed de produtos da loja", why: "Aparece quando alguém pesquisa ‘socas hospitalares’ ou ‘meias de descanso’ no Google, com foto e preço. As listagens gratuitas não custam nada; é o próximo passo com mais retorno." },
  { name: "WhatsApp Business", fit: "média", how: "Catálogo e mensagens", why: "Muitos clientes perguntam tamanhos antes de comprar. Um catálogo no WhatsApp e respostas rápidas ajudam a fechar vendas, sobretudo encomendas de grupo (serviços hospitalares)." },
  { name: "YouTube Shorts", fit: "média", how: "Reaproveitar os vídeos do TikTok/Reels", why: "Mesmo vídeo vertical, mais alcance sem trabalho extra." },
];

async function load() {
  const [status, social] = await Promise.all([
    callFunction<Row>("redes", { mode: "status" }).catch((e: Error) => ({ error: e.message })),
    run<Row | null>(sb().from("settings").select("value").eq("key", "public.social").maybeSingle()),
  ]);
  return { status: status as Row, social: (social?.value ?? {}) as Row };
}

export default function Redes() {
  const s = useLoad(load);
  const { busy, act } = useAction();
  return (
    <>
      <PageHead title="Redes sociais" sub="Liga o Instagram e o Facebook para publicares os posts aprovados com um clique. Os posts são criados em Equipa IA → Propostas." />
      <Loaded s={s}>
        {(d) => {
          const st = d.status, meta: Row = st.meta ?? {};
          const connected = meta.chave && (meta.instagram || meta.pagina);
          return (
            <>
              <Card title="Contas ligadas">
                {st.error && <Alert tone="warn">Não foi possível ver o estado: {st.error}</Alert>}
                <div className="a-social-accounts">
                  <div className="a-social-acc">
                    <strong>Instagram</strong>
                    {st.instagram ? <><Badge tone="ok">ligado</Badge><span>@{st.instagram.username}{st.instagram.followers_count != null ? ` · ${st.instagram.followers_count} seguidores` : ""}</span></>
                      : st.instagram_error ? <><Badge tone="warn">erro</Badge><span className="a-small">{st.instagram_error}</span></>
                      : <Badge tone="muted">por ligar</Badge>}
                  </div>
                  <div className="a-social-acc">
                    <strong>Facebook</strong>
                    {st.facebook ? <><Badge tone="ok">ligado</Badge><span>{st.facebook.link ? <a href={st.facebook.link} target="_blank" rel="noopener noreferrer">{st.facebook.name} ↗</a> : st.facebook.name}</span></>
                      : st.facebook_error ? <><Badge tone="warn">erro</Badge><span className="a-small">{st.facebook_error}</span></>
                      : <Badge tone="muted">por ligar</Badge>}
                  </div>
                  <div className="a-social-acc"><strong>TikTok</strong><Badge tone="muted">publicação manual</Badge><span className="a-small">Descarrega a imagem e copia o texto em cada post.</span></div>
                  <div className="a-social-acc"><strong>Pinterest</strong><Badge tone="muted">publicação manual</Badge></div>
                </div>
                {connected && <p className="a-hint" style={{ marginTop: 10 }}>Os posts aprovados aparecem em <Link href="/admin/agentes">Propostas → Campanhas</Link> com os botões “Publicar no Instagram” e “Publicar no Facebook”.</p>}
              </Card>

              {!connected && (
                <Card title="Como ligar o Instagram e o Facebook (uma vez, ~20 minutos)">
                  <ol className="a-steps">
                    <li>O Instagram tem de ser uma <strong>conta profissional</strong> (Empresa ou Criador) e estar <strong>ligada à página do Facebook</strong> da iNurse. Na app do Instagram: Definições → Tipo de conta e ferramentas; e na página do Facebook: Definições → Contas ligadas → Instagram.</li>
                    <li>Em <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer">developers.facebook.com/apps ↗</a>, cria uma app do tipo <strong>Empresa</strong> e adiciona os produtos “Instagram” e “Facebook Login para Empresas”.</li>
                    <li>No <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noopener noreferrer">Graph API Explorer ↗</a>, escolhe a app, pede as permissões <code>pages_show_list</code>, <code>pages_read_engagement</code>, <code>pages_manage_posts</code>, <code>instagram_basic</code>, <code>instagram_content_publish</code> e gera um token de utilizador.</li>
                    <li>Troca-o por um token de longa duração (no <a href="https://developers.facebook.com/tools/debug/accesstoken/" target="_blank" rel="noopener noreferrer">Depurador de tokens ↗</a> → “Estender”). Depois, no Explorer, pede <code>me/accounts</code>: copia o <strong>access_token</strong> e o <strong>id</strong> da página iNurse. Este token de página não expira.</li>
                    <li>Ainda no Explorer, pede <code>{"{id da página}"}?fields=instagram_business_account</code> e copia o <strong>id</strong> que aparece — é o da conta do Instagram.</li>
                    <li>No Supabase: Edge Functions → Secrets, cria três segredos: <code>META_ACCESS_TOKEN</code> (token da página), <code>META_PAGE_ID</code> (id da página) e <code>META_IG_USER_ID</code> (id do Instagram). Os códigos ficam só lá; nunca os escrevas no backoffice nem no chat.</li>
                    <li>Volta a esta página: as contas devem aparecer como “ligado”.</li>
                  </ol>
                  <p className="a-hint">Enquanto não ligares, cada post tem “Descarregar imagem” e “Copiar texto” para publicares na app.</p>
                </Card>
              )}

              <Card title="Perfis da loja" actions={<span className="a-muted a-small">aparecem no rodapé do site</span>}>
                <form onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget), value: Row = {};
                  for (const [k] of PROFILES) {
                    const v = String(f.get(k) ?? "").trim();
                    if (v && !/^https:\/\//.test(v)) { act(async () => { throw new Error("Os endereços têm de começar por https://"); }); return; }
                    value[k] = v;
                  }
                  act(async () => { await run(sb().from("settings").upsert({ key: "public.social", value, updated_at: new Date().toISOString() })); await s.reload(); }, "Perfis guardados.");
                }}>
                  <div className="a-grid-2">
                    {PROFILES.map(([k, label, ph]) => <Field key={k} label={label}><input name={k} type="url" placeholder={ph} defaultValue={d.social[k] ?? ""} /></Field>)}
                  </div>
                  <div className="a-formfoot"><button className="a-btn primary" disabled={busy}>Guardar perfis</button></div>
                </form>
              </Card>

              <Card title="Onde vale a pena estar">
                <div className="a-channels">
                  {CHANNELS.map((c) => (
                    <div key={c.name} className="a-channel">
                      <div><strong>{c.name}</strong> <Badge tone={c.fit === "alta" ? "ok" : "info"}>interesse {c.fit}</Badge></div>
                      <p className="a-small">{c.why}</p>
                      <p className="a-hint">{c.how}</p>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          );
        }}
      </Loaded>
    </>
  );
}

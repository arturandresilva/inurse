// Rascunhos das páginas informativas e legais. Os campos entre [ ] têm de ser preenchidos/confirmados antes de publicar.
export type PageDraft = { slug: string; title: string; seo_description: string; body_html: string };

export function legalDrafts(store: { name?: string; email?: string; phone?: string }): PageDraft[] {
  const name = store.name || "iNurse";
  const email = store.email || "[email da loja]";
  const phone = store.phone || "[telefone]";
  return [
    {
      slug: "envios", title: "Envios e portes",
      seo_description: "Prazos e custos de envio CTT para Portugal Continental, Açores e Madeira.",
      body_html: `<p>Enviamos para Portugal Continental, Açores e Madeira por CTT Expresso.</p>
<h2>Prazos</h2><ul><li>Os artigos seguem diretamente do armazém do fornecedor.</li><li>Prazo habitual de entrega: [2 a 4] dias úteis após a confirmação do pagamento (Continente).</li><li>Açores e Madeira: [3 a 6] dias úteis.</li></ul>
<h2>Portes</h2><p>O valor dos portes depende do peso da encomenda e da zona, e é sempre mostrado no carrinho antes de pagar.</p>
<p>Quando a encomenda é enviada recebe o código de seguimento CTT por email.</p>`,
    },
    {
      slug: "trocas-e-devolucoes", title: "Trocas e devoluções",
      seo_description: "Como trocar o tamanho ou devolver uma encomenda em 14 dias.",
      body_html: `<p>Tem <strong>14 dias</strong> a contar da receção da encomenda para a devolver ou trocar, sem ter de indicar o motivo (direito de livre resolução, Decreto-Lei n.º 24/2014).</p>
<h2>Como pedir</h2><ol><li>Abra a página da sua encomenda (link no email de confirmação) e escolha “Pedir devolução ou troca”.</li><li>Enviamos-lhe as instruções e a etiqueta CTT para a devolução.</li><li>Quando recebermos o artigo, enviamos o novo tamanho ou devolvemos o valor em até 14 dias.</li></ol>
<h2>Condições</h2><ul><li>Os artigos devem estar sem uso e na embalagem original.</li><li>Por razões de higiene, meias e artigos de compressão só podem ser devolvidos se a embalagem estiver selada.</li><li>Os custos de devolução são [suportados pelo cliente / gratuitos na primeira troca de tamanho].</li></ul>
<p>Dúvidas: ${email}.</p>`,
    },
    {
      slug: "guia-de-tamanhos", title: "Guia de tamanhos",
      seo_description: "Como escolher o número certo de socas, sapatos e meias de compressão.",
      body_html: `<h2>Calçado</h2><p>Meça o pé ao fim do dia, em pé, do calcanhar à ponta do dedo mais comprido. Se estiver entre dois números, escolha o maior.</p>
<p>Nas socas com numeração dupla (ex.: 37/38), escolha pelo seu número habitual.</p>
<h2>Meias de descanso e compressão</h2><p>O tamanho depende do perímetro do tornozelo e da barriga da perna. [Inserir tabela de medidas do fabricante.]</p>
<p>Tem dúvidas? Fale connosco: ${email} · ${phone}.</p>`,
    },
    {
      slug: "contactos", title: "Contactos",
      seo_description: `Fale com a ${name}: email, telefone e horário.`,
      body_html: `<p>Estamos disponíveis para ajudar a escolher o tamanho ou acompanhar a sua encomenda.</p>
<ul><li>Email: ${email}</li><li>Telefone: ${phone} [custo de chamada para rede fixa/móvel nacional]</li><li>Horário: [dias úteis, 9h–18h]</li></ul>
<p>[Nome da empresa], NIF [000000000], [morada da sede].</p>`,
    },
    {
      slug: "termos-e-condicoes", title: "Termos e condições",
      seo_description: "Condições gerais de venda da loja online.",
      body_html: `<p>Estas condições aplicam-se às compras feitas em ${name}, loja online gerida por [Nome da empresa], NIF [000000000], com sede em [morada].</p>
<h2>Preços e pagamento</h2><p>Os preços incluem IVA à taxa legal em vigor. Os portes são indicados antes da confirmação da encomenda. Aceitamos MB WAY, Multibanco e transferência bancária.</p>
<h2>Entrega</h2><p>Ver <a href="/p/envios">Envios e portes</a>.</p>
<h2>Direito de livre resolução</h2><p>Ver <a href="/p/trocas-e-devolucoes">Trocas e devoluções</a>.</p>
<h2>Garantia</h2><p>Os artigos têm a garantia legal de conformidade de 3 anos (Decreto-Lei n.º 84/2021).</p>
<h2>Reclamações</h2><p>Pode reclamar no <a href="https://www.livroreclamacoes.pt" rel="noopener" target="_blank">Livro de Reclamações Eletrónico</a>. Em caso de litígio pode recorrer a uma entidade de resolução alternativa de litígios: [Centro de Arbitragem competente], mais informação em <a href="https://www.consumidor.gov.pt" rel="noopener" target="_blank">www.consumidor.gov.pt</a>.</p>`,
    },
    {
      slug: "privacidade", title: "Política de privacidade",
      seo_description: "Como tratamos os seus dados pessoais.",
      body_html: `<p>O responsável pelo tratamento dos dados é [Nome da empresa], NIF [000000000], contactável em ${email}.</p>
<h2>Que dados usamos e porquê</h2><ul><li>Nome, email, telefone, morada e NIF: para processar e entregar encomendas e emitir a fatura (execução do contrato e obrigação legal).</li><li>Email para a newsletter: só com o seu consentimento, que pode retirar a qualquer momento.</li></ul>
<h2>Com quem partilhamos</h2><p>CTT (entrega), fornecedor (envio direto do armazém), InvoiceXpress (faturação), prestador de pagamentos, e alojamento (Supabase, Vercel). Não vendemos dados.</p>
<h2>Durante quanto tempo</h2><p>Os dados de faturação são guardados pelo prazo legal (10 anos). Os restantes enquanto for cliente ou até pedir a eliminação.</p>
<h2>Os seus direitos</h2><p>Pode pedir acesso, retificação, eliminação ou portabilidade dos seus dados através de ${email}, e reclamar junto da CNPD (www.cnpd.pt).</p>`,
    },
  ];
}

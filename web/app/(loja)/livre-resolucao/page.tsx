import type { Metadata } from "next";
import Link from "next/link";
import WithdrawalForm from "@/components/WithdrawalForm";
import { fullAddress, getLegal, ralHtml } from "@/lib/legal";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("Direito de livre resolução"), description: t("Desista da sua compra em 15 dias: formulário online e modelo de formulário de livre resolução."), alternates: { canonical: "/livre-resolucao" } };
}

export default async function WithdrawalPage() {
  const [l, { t }] = await Promise.all([getLegal(), getT()]);
  const to = `${l.legal_name} (${l.name}), ${fullAddress(l)}`;
  return (
    <article className="wrap prose">
      <h1>{t("Direito de livre resolução")}</h1>
      <p>{t("Tem o direito de resolver o contrato de compra, sem necessidade de indicar qualquer motivo, no prazo de {d} dias a contar do dia em que recebe os artigos (o mínimo legal são 14 dias, nos termos do Decreto-Lei n.º 24/2014).", { d: l.return_days })}</p>
      <p>
        {t("Para exercer este direito, basta comunicar-nos a sua decisão através de uma declaração inequívoca: preenchendo o formulário abaixo, enviando-nos um email para {e} ou uma carta para {a}.", { e: l.email, a: to })}{" "}
        {t("Pode utilizar o modelo de formulário que se encontra no fim desta página, mas não é obrigatório. Para que o prazo seja respeitado, basta que a comunicação seja enviada antes de terminar o prazo.")}
      </p>

      <h2>{t("Formulário online")}</h2>
      <p>{t("Indique o número da encomenda (está no email da compra e na sua área de cliente) e o email que usou na compra.")} <Link href="/conta">{t("Área de cliente")}</Link></p>
      <WithdrawalForm />

      <h2>{t("Efeitos da livre resolução")}</h2>
      <ul>
        <li>{t("Reembolsamos todos os pagamentos recebidos, incluindo os custos de entrega standard, no prazo de 14 dias a contar da data em que formos informados da sua decisão, pelo mesmo meio de pagamento que utilizou (se pagou por Multibanco ou transferência, pedimos-lhe o IBAN).")}</li>
        <li>{t("Podemos reter o reembolso até recebermos os artigos de volta ou até nos apresentar prova do seu envio, consoante o que ocorrer primeiro.")}</li>
        <li>{t("Deve devolver os artigos no prazo de 14 dias a contar da comunicação da sua decisão, para a morada que lhe indicaremos. Os custos diretos da devolução ficam a seu cargo.")}</li>
        <li>{t("Só é responsável pela depreciação dos artigos que resulte de uma manipulação que exceda o necessário para verificar a sua natureza, características e funcionamento. Pode experimentar o calçado como faria numa loja, de preferência numa superfície limpa e sem uso no exterior.")}</li>
        <li>{t("Por razões de proteção da saúde e de higiene, as meias e collants de compressão ou de descanso só podem ser devolvidos com a embalagem selada; depois de abertos, não há direito de livre resolução (artigo 17.º, n.º 1, alínea e) do Decreto-Lei n.º 24/2014).")}</li>
      </ul>
      <p>
        {t("Mais informação em")} <Link href="/p/trocas-e-devolucoes">{t("Trocas e devoluções")}</Link> {t("e nos")} <Link href="/p/termos-e-condicoes">{t("Termos e Condições")}</Link>.{" "}
        {t("Em caso de litígio pode recorrer a")} <span dangerouslySetInnerHTML={{ __html: ralHtml(l) }} />.
      </p>

      <h2 id="modelo">{t("Modelo de formulário de livre resolução")}</h2>
      <p className="muted">{t("(Só deve preencher e enviar este formulário se pretender resolver o contrato. Pode enviá-lo por email ou por carta.)")}</p>
      <div className="notice model-form">
        <p>— {t("Para")}: {to}, {l.email}</p>
        <p>— {t("Pela presente comunico que resolvo o meu contrato de compra e venda relativo aos seguintes bens:")} ……</p>
        <p>— {t("Encomendado em")} …… / {t("recebido em")} ……</p>
        <p>— {t("Número da encomenda")}: ……</p>
        <p>— {t("Nome do consumidor")}: ……</p>
        <p>— {t("Endereço do consumidor")}: ……</p>
        <p>— {t("Assinatura do consumidor (só no caso de o formulário ser enviado em papel)")}: ……</p>
        <p>— {t("Data")}: ……</p>
      </div>
    </article>
  );
}

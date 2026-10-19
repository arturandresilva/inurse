import type { Metadata } from "next";
import Link from "next/link";
import WithdrawalForm from "@/components/WithdrawalForm";

export const metadata: Metadata = {
  title: "Direito de livre resolução",
  description: "Desista da sua compra em 15 dias: formulário online e modelo de formulário de livre resolução.",
  alternates: { canonical: "/livre-resolucao" },
};

export default function WithdrawalPage() {
  return (
    <article className="wrap prose">
      <h1>Direito de livre resolução</h1>
      <p>
        Tem o direito de resolver o contrato de compra, sem necessidade de indicar qualquer motivo, no prazo de <strong>15 dias</strong> a
        contar do dia em que recebe os artigos (o mínimo legal são 14 dias, nos termos do Decreto-Lei n.º 24/2014).
      </p>
      <p>
        Para exercer este direito, basta comunicar-nos a sua decisão através de uma declaração inequívoca: preenchendo o formulário abaixo,
        enviando-nos um email para <a href="mailto:info@inurse.pt">info@inurse.pt</a> ou uma carta para Artur Silva (iNurse), Praça 20 de Maio,
        4590-182 Paços de Ferreira. Pode utilizar o modelo de formulário que se encontra no fim desta página, mas não é obrigatório.
        Para que o prazo seja respeitado, basta que a comunicação seja enviada antes de terminar o prazo.
      </p>

      <h2>Formulário online</h2>
      <p>Indique o número da encomenda (está no email da compra e na sua <Link href="/conta">área de cliente</Link>) e o email que usou na compra.</p>
      <WithdrawalForm />

      <h2>Efeitos da livre resolução</h2>
      <ul>
        <li>Reembolsamos todos os pagamentos recebidos, incluindo os custos de entrega standard, no prazo de 14 dias a contar da data em que formos informados da sua decisão, pelo mesmo meio de pagamento que utilizou (se pagou por Multibanco ou transferência, pedimos-lhe o IBAN).</li>
        <li>Podemos reter o reembolso até recebermos os artigos de volta ou até nos apresentar prova do seu envio, consoante o que ocorrer primeiro.</li>
        <li>Deve devolver os artigos no prazo de 14 dias a contar da comunicação da sua decisão, para a morada que lhe indicaremos. Os custos diretos da devolução ficam a seu cargo.</li>
        <li>Só é responsável pela depreciação dos artigos que resulte de uma manipulação que exceda o necessário para verificar a sua natureza, características e funcionamento. Pode experimentar o calçado como faria numa loja, de preferência numa superfície limpa e sem uso no exterior.</li>
        <li>Por razões de proteção da saúde e de higiene, as meias e collants de compressão ou de descanso só podem ser devolvidos com a embalagem selada; depois de abertos, não há direito de livre resolução (artigo 17.º, n.º 1, alínea e) do Decreto-Lei n.º 24/2014).</li>
      </ul>
      <p>Mais informação em <Link href="/p/trocas-e-devolucoes">Trocas e devoluções</Link> e nos <Link href="/p/termos-e-condicoes">Termos e Condições</Link>.</p>

      <h2 id="modelo">Modelo de formulário de livre resolução</h2>
      <p className="muted">(Só deve preencher e enviar este formulário se pretender resolver o contrato. Pode enviá-lo por email ou por carta.)</p>
      <div className="notice model-form">
        <p>— Para: Artur Silva (iNurse), Praça 20 de Maio, 4590-182 Paços de Ferreira, info@inurse.pt</p>
        <p>— Pela presente comunico que resolvo o meu contrato de compra e venda relativo aos seguintes bens: ……</p>
        <p>— Encomendado em …… / recebido em ……</p>
        <p>— Número da encomenda: ……</p>
        <p>— Nome do consumidor: ……</p>
        <p>— Endereço do consumidor: ……</p>
        <p>— Assinatura do consumidor (só no caso de o formulário ser enviado em papel): ……</p>
        <p>— Data: ……</p>
      </div>
    </article>
  );
}

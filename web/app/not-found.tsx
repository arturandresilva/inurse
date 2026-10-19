import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { getT } from "@/lib/i18n/server";
export default async function NotFound() {
  const { t } = await getT();
  return (
    <>
    <Header />
    <main id="conteudo" className="wrap prose">
      <h1>{t("Página não encontrada")}</h1>
      <p className="muted">{t("O endereço pode ter mudado. Procura pelo teu número ou volta à loja.")}</p>
      <p style={{ marginTop: 20 }}><Link className="btn" href="/loja">{t("Ir para a loja")}</Link></p>
    </main>
    <Footer />
    </>
  );
}

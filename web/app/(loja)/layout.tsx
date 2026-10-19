import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CookieNotice from "@/components/CookieNotice";
import ChatWidget from "@/components/ChatWidget";
import MaintenancePage from "@/components/MaintenancePage";
import Track from "@/components/Track";
import GoogleAnalytics from "@/components/GoogleAnalytics";
import { getMaintenance, OPEN_PATHS, PREVIEW_COOKIE } from "@/lib/maintenance";
import { getLegal } from "@/lib/legal";
import { getT } from "@/lib/i18n/server";

// manutenção: a página fechada não deve ser guardada pelos motores de busca
export async function generateMetadata(): Promise<Metadata> {
  const m = await getMaintenance();
  return m.enabled ? { robots: { index: false, follow: false } } : {};
}

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const [m, h, c] = await Promise.all([getMaintenance(), headers(), cookies()]);
  const path = h.get("x-path") ?? "/";
  const preview = c.get(PREVIEW_COOKIE)?.value === "1";
  const open = OPEN_PATHS.some((p) => path.startsWith(p));
  if (m.enabled && !preview && !open) {
    const [{ t, locale }, legal] = await Promise.all([getT(), getLegal()]);
    return <MaintenancePage m={m} legal={legal} t={t} locale={locale} />;
  }
  return (
    <>
      <a href="#conteudo" className="sr-only">Saltar para o conteúdo</a>
      {m.enabled && preview && <div className="maint-bar">Loja em manutenção: só tu (administrador) estás a ver a loja. <a href="/admin/configuracoes">Desligar</a></div>}
      <Header />
      <main id="conteudo">{children}</main>
      <Footer />
      <CookieNotice />
      {!m.enabled && <ChatWidget />}
      {!preview && <Track />}
      <GoogleAnalytics />
    </>
  );
}

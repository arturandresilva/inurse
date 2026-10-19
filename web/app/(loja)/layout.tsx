import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CookieNotice from "@/components/CookieNotice";
import ChatWidget from "@/components/ChatWidget";

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a href="#conteudo" className="sr-only">Saltar para o conteúdo</a>
      <Header />
      <main id="conteudo">{children}</main>
      <Footer />
      <CookieNotice />
      <ChatWidget />
    </>
  );
}

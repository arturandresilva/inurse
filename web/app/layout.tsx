import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { SITE_URL } from "@/lib/format";
import { HTML_LANG } from "@/lib/i18n";
import { I18nProvider } from "@/lib/i18n/client";
import { getLocale, getT } from "@/lib/i18n/server";
import "./globals.css";

// Inter: letra simples e muito legível, para títulos e texto
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-text", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const { t, locale } = await getT();
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: t("iNurse — calçado profissional e meias de descanso"), template: "%s | iNurse" },
    description: t("Socas hospitalares, sapatos de trabalho e meias de descanso e compressão para enfermeiros, médicos e profissionais que passam o dia de pé. Envio CTT para todo o país."),
    openGraph: { siteName: "iNurse", locale: { pt: "pt_PT", en: "en_GB", es: "es_ES", fr: "fr_FR" }[locale], type: "website" },
    alternates: { canonical: "/" },
  };
}
export const viewport: Viewport = { themeColor: "#0F2F4A" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={HTML_LANG[locale]} className={inter.variable}>
      <body><I18nProvider locale={locale}>{children}</I18nProvider></body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible, Bricolage_Grotesque } from "next/font/google";
import { SITE_URL } from "@/lib/format";
import "./globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-display", display: "swap" });
const text = Atkinson_Hyperlegible({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-text", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "iNurse — calçado profissional e meias de descanso", template: "%s | iNurse" },
  description: "Socas hospitalares, sapatos de trabalho e meias de descanso e compressão para enfermeiros, médicos e profissionais que passam o dia de pé. Envio CTT para todo o país.",
  openGraph: { siteName: "iNurse", locale: "pt_PT", type: "website" },
  alternates: { canonical: "/" },
};
export const viewport: Viewport = { themeColor: "#1c2a4a" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-PT" className={`${display.variable} ${text.variable}`}>
      <body>{children}</body>
    </html>
  );
}

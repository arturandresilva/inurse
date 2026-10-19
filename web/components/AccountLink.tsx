"use client";
import Link from "next/link";
import { useSession } from "@/lib/account";
import { useT } from "@/lib/i18n/client";

export default function AccountLink() {
  const { session } = useSession();
  const t = useT();
  return (
    <Link href="/conta" className="account-link" aria-label={session ? t("A minha conta") : t("Entrar ou criar conta")}>
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      <span className="account-label">{session ? t("Conta") : t("Entrar")}</span>
    </Link>
  );
}

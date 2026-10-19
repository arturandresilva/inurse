"use client";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { SUPABASE_KEY, SUPABASE_URL } from "./supabase";

// Sessão do cliente da loja (separada da do backoffice)
let client: SupabaseClient | null = null;
export function account(): SupabaseClient {
  if (!client) client = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "inurse.conta" },
  });
  return client;
}

export function useSession() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [recovery, setRecovery] = useState(false);
  useEffect(() => {
    const c = account();
    c.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = c.auth.onAuthStateChange((ev, s) => { if (ev === "PASSWORD_RECOVERY") setRecovery(true); setSession(s); });
    return () => data.subscription.unsubscribe();
  }, []);
  return { session, recovery, setRecovery };
}

export function traduzAuth(m: string) {
  const map: Record<string, string> = {
    "Invalid login credentials": "Email ou palavra-passe errados.",
    "Email not confirmed": "Ainda não confirmaste o email. Abre o link que te enviámos.",
    "User already registered": "Já existe uma conta com este email. Entra ou recupera a palavra-passe.",
    "Password should be at least 6 characters.": "A palavra-passe tem de ter pelo menos 8 caracteres.",
  };
  if (map[m]) return map[m];
  if (/rate limit/i.test(m)) return "Foram feitos demasiados pedidos. Tenta de novo daqui a alguns minutos.";
  return m.replace(/^.*?: /, "");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Me = { profile: any; addresses: any[]; orders: any[]; favorites: any[] };
export async function loadMe(): Promise<Me> {
  const { data, error } = await account().rpc("customer_me");
  if (error) throw new Error(traduzAuth(error.message));
  return data as Me;
}

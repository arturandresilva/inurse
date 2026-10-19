"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase";

// Cliente do backoffice: guarda a sessão do administrador neste browser.
// A segurança está nas regras da base de dados (is_admin()), não neste código.
let client: SupabaseClient | null = null;
export function sb(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "inurse.admin" },
    });
  }
  return client;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

type Result = { data: unknown; error: { message: string } | null; count?: number | null };

/** Executa uma consulta e lança erro legível em vez de devolver {error}. */
export async function run<T = Row[]>(p: PromiseLike<Result>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(traduz(error.message));
  return data as T;
}

export async function rpc<T = Row>(fn: string, args: Row = {}): Promise<T> {
  return run<T>(sb().rpc(fn, args));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function count(table: string, filter?: (q: any) => any): Promise<number> {
  // contagem exata sem trazer linhas
  let q = sb().from(table).select("*", { count: "exact", head: true });
  if (filter) q = filter(q);
  const { count: n, error } = await q;
  if (error) throw new Error(traduz(error.message));
  return n ?? 0;
}

export function traduz(m: string): string {
  const map: Record<string, string> = {
    "Invalid login credentials": "Email ou palavra-passe errados.",
    "Email not confirmed": "Ainda não confirmaste o email. Abre o link que recebeste.",
    "JWT expired": "A sessão expirou. Entra outra vez.",
  };
  if (map[m]) return map[m];
  if (/duplicate key/.test(m)) return "Já existe um registo com esse valor (deve ser único).";
  if (/violates check constraint/.test(m)) return "Há um valor inválido no formulário.";
  if (/violates foreign key/.test(m)) return "Este registo está a ser usado noutro sítio e não pode ser apagado.";
  return m;
}

export async function uploadPublic(bucket: string, path: string, file: File | Blob): Promise<string> {
  const { error } = await sb().storage.from(bucket).upload(path, file, { upsert: true, contentType: (file as File).type || undefined });
  if (error) throw new Error(traduz(error.message));
  return sb().storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

export async function callFunction<T = Row>(name: string, body: Row = {}): Promise<T> {
  const { data, error } = await sb().functions.invoke(name, { body });
  if (error) {
    // a função devolve {error: "..."} em JSON; mostra essa mensagem
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      const j = await ctx.json().catch(() => null);
      if (j?.error) throw new Error(j.error);
    }
    throw new Error(error.message);
  }
  return data as T;
}

import { createClient } from "@supabase/supabase-js";

// Chaves públicas (publicáveis): a segurança está nas regras RLS da base de dados.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://ssmckeparvmrahsnoypt.supabase.co";
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_KEY ?? "sb_publishable_nWUetYsykXlKAMFPiZ6bMA_otPjBs06";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

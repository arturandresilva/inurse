import { supabase } from "./supabase";

// Modo de manutenção (backoffice → Configurações → Loja)
export type Maintenance = { enabled: boolean; message: string; until: string | null };
export const PREVIEW_COOKIE = "inurse.preview";
// páginas que continuam abertas: quem já encomendou consegue ver a encomenda, pagar, avaliar ou devolver; e as páginas legais
export const OPEN_PATHS = ["/encomenda", "/avaliar", "/livre-resolucao", "/p/"];

export async function getMaintenance(): Promise<Maintenance> {
  const { data } = await supabase.from("settings").select("value").eq("key", "public.maintenance").maybeSingle();
  const v = (data?.value ?? {}) as Partial<Maintenance>;
  return { enabled: !!v.enabled, message: String(v.message ?? ""), until: v.until ?? null };
}

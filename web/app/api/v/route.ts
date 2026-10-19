import { NextResponse, type NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

// Contador de visitas da loja (sem cookies): recebe a página vista e regista-a com uma impressão digital diária.
// O IP e o navegador só servem para calcular essa impressão digital na base de dados e não ficam guardados.
const BOT = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegram|preview|headless|lighthouse|pingdom|uptime|curl|wget|python|axios|node-fetch/i;

export async function POST(req: NextRequest) {
  try {
    const ua = req.headers.get("user-agent") ?? "";
    if (!ua || BOT.test(ua) || req.headers.get("dnt") === "1") return new NextResponse(null, { status: 204 });
    const b = await req.json().catch(() => ({}));
    const path = String(b.p ?? "/").split("?")[0].slice(0, 300);
    let refHost = "";
    try { const r = new URL(String(b.r ?? "")); refHost = r.hostname.replace(/^www\./, ""); } catch { /* sem origem */ }
    const self = req.nextUrl.hostname.replace(/^www\./, "");
    if (refHost === self || refHost.endsWith("inurse.pt") || refHost.endsWith("vercel.app")) refHost = "";
    const q = new URLSearchParams(String(b.q ?? ""));
    const device = /ipad|tablet/i.test(ua) ? "tablet" : /mobi|android|iphone/i.test(ua) ? "telemovel" : "computador";
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "";
    await supabase.rpc("track_view", { p: {
      path, ref_host: refHost, utm_source: q.get("utm_source") ?? "", utm_medium: q.get("utm_medium") ?? "", utm_campaign: q.get("utm_campaign") ?? "",
      ip, ua, device, country: req.headers.get("x-vercel-ip-country") ?? "", locale: String(b.l ?? "").slice(0, 5),
    } });
  } catch { /* uma visita perdida não importa */ }
  return new NextResponse(null, { status: 204 });
}

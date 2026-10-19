import { NextResponse, type NextRequest } from "next/server";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n";

// ?lang=en (links partilhados, emails) guarda a língua e volta ao mesmo endereço sem o parâmetro.
// O endereço pedido segue no cabeçalho x-path (o modo de manutenção deixa algumas páginas abertas).
export function middleware(req: NextRequest) {
  const lang = req.nextUrl.searchParams.get("lang");
  if (!lang) {
    const h = new Headers(req.headers);
    h.set("x-path", req.nextUrl.pathname);
    return NextResponse.next({ request: { headers: h } });
  }
  const url = req.nextUrl.clone();
  url.searchParams.delete("lang");
  const res = NextResponse.redirect(url);
  if (isLocale(lang)) res.cookies.set(LOCALE_COOKIE, lang, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  return res;
}
export const config = { matcher: ["/((?!admin|_next|api|.*\\..*).*)"] };

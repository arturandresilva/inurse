"""Gera o pacote de marca iNurse (logótipo "Monolinha A2": i menta com coração coral + NURSE em maiúsculas de traço redondo).
Uso: python3 scripts/marca/build.py   → escreve web/public/marca/*, web/app/icon.svg, favicon.ico, apple-icon.png, opengraph-image.png
e web/components/Logo.tsx. Os PNG são desenhados com o Chromium do Playwright."""
import math, os, io, pathlib
ROOT = pathlib.Path(__file__).resolve().parents[2]
WEB = ROOT / "web"; OUT = WEB / "public" / "marca"; PNG = OUT / "png"
INK, MINT, CORAL, SKY, WH = "#0F2F4A", "#48BBAE", "#F27C79", "#D7EAF7", "#FFFFFF"

# ---------- geometria ----------
BOT, HC, W60, SW, TRACK, HS = 100, 50, 60, 9, 16, 30
TOP = BOT - HC; MID = (TOP + BOT) / 2; IX = 14

def heart_d(cx, cy, s):
    h = s / 2
    return (f"M{cx:.2f},{cy+h*0.95:.2f} C{cx-h*0.15:.2f},{cy+h*0.8:.2f} {cx-h:.2f},{cy+h*0.25:.2f} {cx-h:.2f},{cy-h*0.25:.2f} "
            f"C{cx-h:.2f},{cy-h*0.75:.2f} {cx-h*0.45:.2f},{cy-h*0.95:.2f} {cx:.2f},{cy-h*0.45:.2f} C{cx+h*0.45:.2f},{cy-h*0.95:.2f} {cx+h:.2f},{cy-h*0.75:.2f} {cx+h:.2f},{cy-h*0.25:.2f} "
            f"C{cx+h:.2f},{cy+h*0.25:.2f} {cx+h*0.15:.2f},{cy+h*0.8:.2f} {cx:.2f},{cy+h*0.95:.2f} Z")

def nurse_d():
    x = IX + 32; d = []
    w = W60*0.64; d.append(f"M{x:.2f},{BOT} V{TOP} L{x+w:.2f},{BOT} V{TOP}"); x += w + TRACK
    w = W60*0.6; r = w/2; d.append(f"M{x:.2f},{TOP} V{BOT-r:.2f} A{r:.2f} {r:.2f} 0 0 0 {x+w:.2f},{BOT-r:.2f} V{TOP}"); x += w + TRACK
    w = W60*0.52; br = HC*0.25
    d.append(f"M{x:.2f},{BOT} V{TOP} H{x+w-br:.2f} A{br:.2f} {br:.2f} 0 0 1 {x+w-br:.2f},{TOP+2*br:.2f} H{x:.2f} M{x+w*0.45:.2f},{TOP+2*br:.2f} L{x+w:.2f},{BOT}"); x += w + TRACK
    ry = HC/4; rx = max(ry, W60*0.25); cx = x + rx; a = math.radians(40)
    p1 = (cx + rx*math.cos(a), TOP + ry - ry*math.sin(a)); p2 = (cx - rx*math.cos(a), BOT - ry + ry*math.sin(a))
    d.append(f"M{p1[0]:.2f},{p1[1]:.2f} A{rx:.2f} {ry:.2f} 0 1 0 {cx:.2f},{MID:.2f} A{rx:.2f} {ry:.2f} 0 1 1 {p2[0]:.2f},{p2[1]:.2f}"); x += 2*rx + TRACK
    w = W60*0.46; d.append(f"M{x+w:.2f},{TOP} H{x:.2f} V{BOT} H{x+w:.2f} M{x:.2f},{MID:.2f} H{x+w*0.85:.2f}")
    return " ".join(d), x + w

NURSE, END = nurse_d()
STEM_TOP = TOP + HS*0.5 + 8
I_D = f"M{IX},{BOT} V{STEM_TOP:.2f}"
HEART = heart_d(IX + 1, TOP + 1, HS)
pad = SW/2 + 1
VB = (IX - HS/2 - 1, TOP + 1 - HS*0.5, END + pad - (IX - HS/2 - 1), BOT + pad - (TOP + 1 - HS*0.5))
VBS = " ".join(f"{v:.2f}" for v in VB)

def logo_inner(ink=INK, i=MINT, h=CORAL):
    st = f'fill="none" stroke-width="{SW}" stroke-linecap="round" stroke-linejoin="round"'
    return (f'<path d="{NURSE}" stroke="{ink}" {st}/><path d="{I_D}" stroke="{i}" {st}/><path d="{HEART}" fill="{h}"/>')

def logo_svg(**k): return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{VBS}" role="img" aria-label="iNurse">{logo_inner(**k)}</svg>'

# símbolo: só o i com o coração, centrado num quadrado 100×100
def symbol_inner(i=MINT, h=CORAL, scale=1.0):
    x0, y0, x1, y1 = IX - HS/2, TOP + 1 - HS*0.5, IX + HS/2 + 1, BOT + SW/2
    s = 62 / (y1 - y0) * scale; tx = 50 - (IX + 1) * s; ty = 50 - (y0 + y1) / 2 * s
    return (f'<g transform="translate({tx:.2f},{ty:.2f}) scale({s:.3f})"><path d="{I_D}" stroke="{i}" stroke-width="{SW*1.15}" stroke-linecap="round" fill="none"/>'
            f'<path d="{heart_d(IX + 1, TOP + 1, HS*1.05)}" fill="{h}"/></g>')
def tile(bg, i=MINT, h=CORAL, rx=22, stroke=None, scale=1.0):
    r = f'<rect x="1" y="1" width="98" height="98" rx="{rx}" fill="{bg}"' + (f' stroke="{stroke}" stroke-width="2"' if stroke else "") + "/>"
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="iNurse">{r}{symbol_inner(i, h, scale)}</svg>'

FILES = {
    "inurse-logo.svg": logo_svg(),
    "inurse-logo-fundo-escuro.svg": logo_svg(ink=WH),
    "inurse-logo-azul-tinta.svg": logo_svg(ink=INK, i=INK, h=INK),
    "inurse-logo-branco.svg": logo_svg(ink=WH, i=WH, h=WH),
    "inurse-icone.svg": tile(INK),
    "inurse-icone-claro.svg": tile(WH, stroke="#E3EAF0"),
    "inurse-icone-menta.svg": tile(MINT, i=WH),
    "inurse-favicon.svg": tile(INK, rx=20, scale=1.25),
    "inurse-simbolo.svg": f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="iNurse">{symbol_inner()}</svg>',
}
for n, s in FILES.items(): (OUT / n).write_text(s)
(WEB / "app" / "icon.svg").write_text(FILES["inurse-favicon.svg"])

# ---------- componente React ----------
(WEB / "components" / "Logo.tsx").write_text(f'''// Logótipo iNurse ("Monolinha"): i em menta com um coração coral por cima e NURSE em maiúsculas de traço redondo.
// Gerado por scripts/marca/build.py — não editar à mão.
// light = para fundos escuros (NURSE a branco); mono = tudo numa só cor (carimbos, impressão a uma cor).
const NURSE = "{NURSE}";
const I = "{I_D}";
const HEART = "{HEART}";

export default function Logo({{ height = 30, light, mono, className }}: {{ height?: number; light?: boolean; mono?: string; className?: string; pulse?: boolean }}) {{
  const ink = mono ?? (light ? "#FFFFFF" : "{INK}");
  const line = {{ fill: "none", strokeWidth: {SW}, strokeLinecap: "round" as const, strokeLinejoin: "round" as const }};
  return (
    <svg className={{className}} viewBox="{VBS}" height={{height}} role="img" aria-label="iNurse">
      <path d={{NURSE}} stroke={{ink}} {{...line}} />
      <path d={{I}} stroke={{mono ?? "{MINT}"}} {{...line}} />
      <path d={{HEART}} fill={{mono ?? "{CORAL}"}} />
    </svg>
  );
}}
''')

# ---------- PNG ----------
from playwright.sync_api import sync_playwright
import base64
def uri(svg): return "data:image/svg+xml;base64," + base64.b64encode(svg.encode()).decode()
def page_html(body, w, h, bg="transparent"):
    return f'<!doctype html><html><head><meta charset="utf-8"><style>html,body{{margin:0;width:{w}px;height:{h}px;background:{bg};overflow:hidden;font-family:Inter,sans-serif}}</style></head><body>{body}</body></html>'
def logo_png(svg, w, bg="transparent", padfrac=0.0):
    h = round(w * VB[3] / VB[2]); return page_html(f'<img src="{uri(svg)}" style="width:{w}px;height:{h}px;display:block">', w, h, bg), w, h
def sq_png(svg, n): return page_html(f'<img src="{uri(svg)}" style="width:{n}px;height:{n}px;display:block">', n, n), n, n
SHARE = lambda: page_html(f'''<div style="width:1200px;height:630px;background:radial-gradient(900px 500px at 85% 0%,#D7EAF7,transparent 70%),linear-gradient(180deg,#F3F8F7,#fff);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px">
<img src="{uri(FILES["inurse-logo.svg"])}" style="width:600px">
<div style="font:600 44px Inter;color:{INK};letter-spacing:-.01em">Calçado e meias para profissionais de saúde</div>
<div style="font:500 28px Inter;color:#2A8378">Envio CTT para todo o país · trocas em 15 dias</div></div>''', 1200, 630)
AVATAR = lambda: page_html(f'<div style="width:1080px;height:1080px;background:{INK};display:flex;align-items:center;justify-content:center"><img src="{uri(symbol_svg_nobg())}" style="width:900px"></div>', 1080, 1080)
def symbol_svg_nobg(): return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">{symbol_inner()}</svg>'

jobs = []
for w in (300, 600, 1200): jobs.append((f"inurse-logo-{w}.png", *logo_png(FILES["inurse-logo.svg"], w)))
jobs.append(("inurse-logo-azul-tinta-1200.png", *logo_png(FILES["inurse-logo-azul-tinta.svg"], 1200)))
jobs.append(("inurse-logo-branco-1200.png", *logo_png(FILES["inurse-logo-branco.svg"], 1200)))
for w in (600, 1200): jobs.append((f"inurse-logo-fundo-escuro-{w}.png", *logo_png(FILES["inurse-logo-fundo-escuro.svg"], w, bg=INK)))
for n in (16, 32, 48, 64, 180, 192, 512, 1024): jobs.append((f"inurse-icone-{n}.png", *sq_png(FILES["inurse-icone.svg"], n)))
for n in (512, 1024): jobs.append((f"inurse-icone-claro-{n}.png", *sq_png(FILES["inurse-icone-claro.svg"], n)))
jobs.append(("inurse-icone-menta-1024.png", *sq_png(FILES["inurse-icone-menta.svg"], 1024)))
for n in (16, 32, 48, 64): jobs.append((f"inurse-favicon-{n}.png", *sq_png(FILES["inurse-favicon.svg"], n)))
jobs.append(("inurse-apple-touch-180.png", *sq_png(tile(INK, rx=0, scale=1.1), 180)))
jobs.append(("inurse-avatar-redes-1080.png", AVATAR(), 1080, 1080))
jobs.append(("inurse-partilha-1200x630.png", SHARE(), 1200, 630))
with sync_playwright() as p:
    b = p.chromium.launch()
    for name, html, w, h in jobs:
        pg = b.new_page(viewport={"width": w, "height": h}); pg.set_content(html); pg.wait_for_timeout(150)
        pg.screenshot(path=str(PNG / name), omit_background=True, clip={"x": 0, "y": 0, "width": w, "height": h}); pg.close()
    b.close()
import shutil
shutil.copy(PNG / "inurse-apple-touch-180.png", WEB / "app" / "apple-icon.png")
shutil.copy(PNG / "inurse-partilha-1200x630.png", WEB / "app" / "opengraph-image.png")
from PIL import Image
Image.open(PNG / "inurse-favicon-64.png").save(OUT / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
shutil.copy(OUT / "favicon.ico", WEB / "app" / "favicon.ico")
# zip do pacote
import zipfile
with zipfile.ZipFile(OUT / "inurse-marca.zip", "w", zipfile.ZIP_DEFLATED) as z:
    for f in sorted(OUT.glob("*.svg")) + sorted(PNG.glob("*.png")) + [OUT / "favicon.ico", OUT / "guia.html"]:
        z.write(f, f.relative_to(OUT))
print("ok", VBS)

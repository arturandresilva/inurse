import { getSession, signIn, signUp, recover, signOut, rpc } from './api.js';
import { esc, $, toast, busy } from './ui.js';
import * as sales from './views-sales.js';
import * as catalog from './views-catalog.js';
import * as admin from './views-admin.js';

const NAV = [
  ['painel', 'Painel', 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z'],
  ['encomendas', 'Encomendas', 'M20 4H4v13h16V4zm-2 11H6V6h12v9zM2 19h20v2H2z'],
  ['produtos', 'Produtos', 'M21.4 11.6l-9-9A2 2 0 0011 2H4a2 2 0 00-2 2v7c0 .6.2 1.1.6 1.4l9 9a2 2 0 002.8 0l7-7a2 2 0 000-2.8zM5.5 7A1.5 1.5 0 117 5.5 1.5 1.5 0 015.5 7z',
    [['stock', 'Stock'], ['categorias', 'Categorias'], ['marcas', 'Marcas']]],
  ['clientes', 'Clientes', 'M16 11a3 3 0 100-6 3 3 0 000 6zm-8 0a3 3 0 100-6 3 3 0 000 6zm0 2c-2.3 0-7 1.2-7 3.5V19h14v-2.5C15 14.2 10.3 13 8 13zm8 0c-.3 0-.6 0-1 .1 1.2.8 2 2 2 3.4V19h6v-2.5c0-2.3-4.7-3.5-7-3.5z'],
  ['promocoes', 'Promoções', 'M12 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 14.3 7.2 16.9l.9-5.4L4.2 7.7l5.4-.8z'],
  ['multimedia', 'Multimédia', 'M21 19V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2zM8.5 13.5l2.5 3 3.5-4.5 4.5 6H5l3.5-4.5z'],
  ['configuracoes', 'Configurações', 'M19.4 13a7.5 7.5 0 000-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 00-1.7-1L15 3h-4l-.4 2.7a7.4 7.4 0 00-1.7 1l-2.5-1-2 3.5L6.6 11a7.5 7.5 0 000 2l-2.1 1.6 2 3.5 2.5-1c.5.4 1.1.7 1.7 1L11 21h4l.4-2.7c.6-.3 1.2-.6 1.7-1l2.5 1 2-3.5zM13 15.5a3.5 3.5 0 110-7 3.5 3.5 0 010 7z'],
  ['importar', 'Importar CTT', 'M5 20h14v-2H5v2zm7-18l-5.5 5.5 1.4 1.4L11 5.8V16h2V5.8l3.1 3.1 1.4-1.4z'],
];
const SOON = ['Marketing', 'Blog', 'Páginas', 'Aparência', 'Apps'];

const ROUTES = {
  painel: sales.dashboard,
  encomendas: sales.orders,
  encomenda: sales.order,
  clientes: sales.customers,
  cliente: sales.customer,
  promocoes: sales.promotions,
  produtos: catalog.products,
  produto: catalog.product,
  stock: catalog.stock,
  categorias: catalog.categories,
  marcas: catalog.brands,
  multimedia: admin.media,
  configuracoes: admin.settings,
  importar: admin.importer,
};

let isAdmin = null;

function shell() {
  const cur = location.hash.slice(2).split('/')[0] || 'painel';
  const item = ([k, label, icon, sub]) => {
    const active = cur === k || (sub && sub.some(([s]) => s === cur)) || (k === 'produtos' && cur === 'produto') ||
      (k === 'encomendas' && cur === 'encomenda') || (k === 'clientes' && cur === 'cliente');
    return `<a class="nav-item${active ? ' active' : ''}" href="#/${k}"><svg viewBox="0 0 24 24"><path d="${icon}"/></svg>${esc(label)}</a>
      ${sub && active ? `<div class="nav-sub">${sub.map(([s, l]) => `<a class="${cur === s ? 'active' : ''}" href="#/${s}">${l}</a>`).join('')}</div>` : ''}`;
  };
  return `
  <aside class="side">
    <div class="brand"><span class="logo">i</span>Nurse<small>backoffice</small></div>
    <nav>${NAV.map(item).join('')}
      <div class="nav-soon"><span>Em breve</span>${SOON.map((s) => `<em>${s}</em>`).join('')}</div>
    </nav>
    <div class="side-foot"><span title="${esc(getSession()?.email)}">${esc(getSession()?.email || '')}</span><button class="link" id="logout">Sair</button></div>
  </aside>
  <button class="menu-btn" id="menuBtn" aria-label="Menu">☰</button>
  <main id="view"></main>`;
}

function loginView(mode = 'entrar') {
  document.body.className = 'auth';
  document.getElementById('app').innerHTML = `
  <form class="auth-card" id="authForm">
    <div class="brand big"><span class="logo">i</span>Nurse<small>backoffice</small></div>
    <h1>${mode === 'criar' ? 'Criar conta de administrador' : mode === 'recuperar' ? 'Recuperar palavra-passe' : 'Entrar'}</h1>
    <label>Email<input type="email" name="email" required autocomplete="username" value="${esc(getSession()?.email || '')}"></label>
    ${mode !== 'recuperar' ? `<label>Palavra-passe<input type="password" name="password" required minlength="8" autocomplete="${mode === 'criar' ? 'new-password' : 'current-password'}"></label>` : ''}
    <button class="btn primary" type="submit">${mode === 'criar' ? 'Criar conta' : mode === 'recuperar' ? 'Enviar link' : 'Entrar'}</button>
    <p class="auth-links">
      ${mode !== 'entrar' ? '<a href="#/entrar">Já tenho conta</a>' : '<a href="#/criar">Primeira vez? Criar conta</a> · <a href="#/recuperar">Esqueci-me da palavra-passe</a>'}
    </p>
    <p class="hint" id="authMsg"></p>
  </form>`;
  $('#authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target); const btn = e.submitter;
    await busy(btn, async () => {
      if (mode === 'recuperar') { await recover(f.get('email')); $('#authMsg').textContent = 'Se o email existir, recebes um link para definir nova palavra-passe.'; return; }
      if (mode === 'criar') {
        const logged = await signUp(f.get('email'), f.get('password'));
        if (!logged) { $('#authMsg').textContent = 'Conta criada. Confirma o email (abre o link que recebeste) e depois entra.'; return; }
      } else await signIn(f.get('email'), f.get('password'));
      isAdmin = null; location.hash = '#/painel'; route();
    }).catch(() => {});
  });
}

async function route() {
  const [name = 'painel', ...params] = location.hash.slice(2).split('/');
  // tokens devolvidos pelos links de email (confirmação / recuperação)
  if (location.hash.includes('access_token=')) {
    const p = new URLSearchParams(location.hash.slice(1));
    try {
      localStorage.setItem('inurse.session', JSON.stringify({ access_token: p.get('access_token'), refresh_token: p.get('refresh_token'),
        expires_at: Math.floor(Date.now() / 1000) + Number(p.get('expires_in') || 3600) }));
    } catch { /* */ }
    location.replace(location.pathname + (p.get('type') === 'recovery' ? '#/configuracoes/conta' : '#/painel')); location.reload(); return;
  }
  if (['entrar', 'criar', 'recuperar'].includes(name) || !getSession()) return loginView(getSession() ? name : (['criar', 'recuperar'].includes(name) ? name : 'entrar'));
  if (isAdmin === null) { try { isAdmin = await rpc('is_admin'); } catch { isAdmin = false; } }
  if (!isAdmin) {
    document.body.className = 'auth';
    document.getElementById('app').innerHTML = `<div class="auth-card"><h1>Sem acesso</h1><p>A conta ${esc(getSession()?.email)} não é administradora desta loja.</p><button class="btn" id="out">Sair</button></div>`;
    $('#out').onclick = () => { signOut(); isAdmin = null; location.hash = '#/entrar'; route(); };
    return;
  }
  document.body.className = '';
  document.getElementById('app').innerHTML = shell();
  $('#logout').onclick = () => { signOut(); isAdmin = null; location.hash = '#/entrar'; route(); };
  $('#menuBtn').onclick = () => document.body.classList.toggle('nav-open');
  const view = ROUTES[name] || ROUTES.painel;
  const el = $('#view');
  el.innerHTML = '<div class="loading"><span class="spin"></span></div>';
  try { await view(el, params.map(decodeURIComponent)); }
  catch (e) { el.innerHTML = `<div class="page"><div class="alert err">${esc(e.message)}</div></div>`; console.error(e); }
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', () => { document.body.classList.remove('nav-open'); route(); });
window.addEventListener('unhandledrejection', (e) => { if (e.reason?.message) toast(e.reason.message, 'err'); });
route();

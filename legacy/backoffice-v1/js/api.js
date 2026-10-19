// Ligação direta à API do Supabase (sem bibliotecas externas)
export const SUPABASE_URL = 'https://ssmckeparvmrahsnoypt.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_nWUetYsykXlKAMFPiZ6bMA_otPjBs06';
const STORE = 'inurse.session';

let session = null;
try { session = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch { session = null; }

function saveSession(s) {
  session = s;
  try { s ? localStorage.setItem(STORE, JSON.stringify(s)) : localStorage.removeItem(STORE); } catch { /* sem storage */ }
}

export const getSession = () => session;

async function authCall(path, body) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(traduzErro(data.error_description || data.msg || data.message || data.error || `Erro ${r.status}`));
  return data;
}

function traduzErro(m) {
  const map = {
    'Invalid login credentials': 'Email ou palavra-passe errados.',
    'Email not confirmed': 'Ainda não confirmaste o email. Abre o link que recebeste na caixa de correio.',
    'User already registered': 'Já existe uma conta com este email. Usa "Entrar".',
  };
  return map[m] || m;
}

function storeTokens(d) {
  saveSession({
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + (d.expires_in || 3600),
    email: d.user?.email,
  });
}

export async function signIn(email, password) {
  storeTokens(await authCall('token?grant_type=password', { email, password }));
}
export async function signUp(email, password) {
  const d = await authCall(`signup?redirect_to=${encodeURIComponent(location.origin)}`, { email, password });
  if (d.access_token) storeTokens(d);
  return !!d.access_token;
}
export const recover = (email) => authCall(`recover?redirect_to=${encodeURIComponent(location.origin)}`, { email });
export function signOut() { saveSession(null); }
export async function updatePassword(password) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { method: 'PUT', headers: await headers({ 'Content-Type': 'application/json' }), body: JSON.stringify({ password }) });
  return handle(r);
}

async function token() {
  if (!session) return null;
  if (session.expires_at - 60 < Date.now() / 1000) {
    try { storeTokens(await authCall('token?grant_type=refresh_token', { refresh_token: session.refresh_token })); }
    catch { saveSession(null); location.hash = '#/entrar'; return null; }
  }
  return session.access_token;
}

async function headers(extra = {}) {
  const t = await token();
  return { apikey: SUPABASE_KEY, ...(t ? { Authorization: `Bearer ${t}` } : {}), ...extra };
}

async function handle(r) {
  if (r.status === 204) return null;
  const txt = await r.text();
  const data = txt ? JSON.parse(txt) : null;
  if (!r.ok) {
    if (r.status === 401) { saveSession(null); location.hash = '#/entrar'; }
    throw new Error(data?.message || data?.error || `Erro ${r.status}`);
  }
  return data;
}

// db('products?select=*&order=title') ; db('products', {method:'POST', body:{...}})
export async function db(path, { method = 'GET', body, prefer } = {}) {
  const h = await headers({ 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) });
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  return handle(r);
}

// contagem exata sem trazer linhas
export async function count(path) {
  const h = await headers({ Prefer: 'count=exact', Range: '0-0' });
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}${path.includes('?') ? '&' : '?'}select=*`, { method: 'HEAD', headers: h });
  const cr = r.headers.get('content-range') || '*/0';
  return parseInt(cr.split('/')[1], 10) || 0;
}

export const rpc = (fn, args = {}) => db(`rpc/${fn}`, { method: 'POST', body: args });

export async function uploadImage(path, file) {
  const h = await headers({ 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'true' });
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/produtos/${path}`, { method: 'POST', headers: h, body: file });
  await handle(r);
  return `${SUPABASE_URL}/storage/v1/object/public/produtos/${path}`;
}

export async function callFunction(name, body = {}) {
  const h = await headers({ 'Content-Type': 'application/json' });
  const r = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, { method: 'POST', headers: h, body: JSON.stringify(body) });
  return handle(r);
}

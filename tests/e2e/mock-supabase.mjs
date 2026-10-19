// Réplica mínima do Supabase para testes do backoffice: auth (JWT), REST (PostgREST), storage e funções.
import http from 'node:http';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const SECRET = process.env.JWT_SECRET || 'local-test-secret-local-test-secret-123456';
const PGREST = Number(process.env.PGREST_PORT || 3001);
const PORT = Number(process.env.MOCK_PORT || 3002);
const PSQL = (process.env.PSQL || 'psql -d e2e').split(' ');
const sql = (q) => execFileSync(PSQL[0], [...PSQL.slice(1), '-At', '-c', q]).toString().trim();
const lit = (s) => `'${String(s ?? '').replace(/'/g, "''")}'`;
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (sub, email) => {
  const h = b64({ alg: 'HS256', typ: 'JWT' });
  const p = b64({ sub, email, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 });
  return `${h}.${p}.${crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url')}`;
};
const user = (id, email) => ({ id, email, aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: new Date().toISOString() });
const session = (id, email) => ({ access_token: jwt(id, email), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: `r.${id}.${email}`, user: user(id, email) });
const storage = new Map();
const calls = [];
const body = (req) => new Promise((r) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => r(Buffer.concat(c))); });
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Expose-Headers': 'content-range, content-profile' };

http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const url = new URL(req.url, 'http://x');
  const send = (code, obj) => { res.writeHead(code, { ...cors, 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
  const raw = await body(req);
  try {
    if (url.pathname.startsWith('/auth/v1/')) {
      const b = raw.length && /json/.test(req.headers['content-type'] || '') ? JSON.parse(raw) : {};
      const ep = url.pathname.slice(9);
      if (ep === 'token' && url.searchParams.get('grant_type') === 'refresh_token') {
        const [, id, email] = String(b.refresh_token || '').split('.');
        return id ? send(200, session(id, email)) : send(400, { error_description: 'Invalid Refresh Token' });
      }
      if (ep === 'signup') {
        const id = sql(`insert into auth.users(email, encrypted_password) values (lower(${lit(b.email)}), md5(${lit(b.password)})) on conflict (email) do nothing returning id`).split('\n')[0];
        if (!id) return send(422, { code: 422, error_code: 'user_already_exists', msg: 'User already registered' });
        return send(200, session(id, b.email));
      }
      if (ep === 'token') {
        const id = sql(`select id from auth.users where lower(email)=lower(${lit(b.email)}) and encrypted_password=md5(${lit(b.password)})`);
        if (!id) return send(400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
        return send(200, session(id, b.email));
      }
      if (ep === 'user') {
        const tok = (req.headers.authorization || '').split(' ')[1] || '';
        const p = JSON.parse(Buffer.from(tok.split('.')[1] || 'e30', 'base64url').toString());
        return p.sub ? send(200, user(p.sub, p.email)) : send(401, { msg: 'no user' });
      }
      if (ep === 'logout') { res.writeHead(204, cors); return res.end(); }
      if (ep === 'recover') return send(200, {});
      return send(200, {});
    }
    if (url.pathname.startsWith('/rest/v1/')) {
      const headers = { ...req.headers }; delete headers.host; delete headers.apikey;
      if (headers.authorization && headers.authorization.split('.').length !== 3) delete headers.authorization;
      const pr = http.request({ host: '127.0.0.1', port: PGREST, path: req.url.slice(8), method: req.method, headers }, (pres) => {
        const h = Object.fromEntries(Object.entries(pres.headers).filter(([k]) => !k.startsWith('access-control-')));
        res.writeHead(pres.statusCode, { ...h, ...cors }); pres.pipe(res);
      });
      pr.on('error', (e) => send(502, { message: e.message }));
      pr.end(raw.length ? raw : undefined);
      return;
    }
    if (url.pathname.startsWith('/storage/v1/object/public/')) {
      const f = storage.get(url.pathname.slice(26)); if (!f) { res.writeHead(404, cors); return res.end(); }
      res.writeHead(200, { ...cors, 'Content-Type': f.type }); return res.end(f.data);
    }
    if (url.pathname.startsWith('/storage/v1/object/')) {
      const key = url.pathname.slice(19).replace(/^(authenticated|sign)\//, '');
      storage.set(key, { data: raw, type: req.headers['content-type'] });
      return send(200, { Key: key, Id: crypto.randomUUID() });
    }
    if (url.pathname.startsWith('/functions/v1/')) {
      const name = url.pathname.slice(14);
      const b = raw.length ? JSON.parse(raw) : {};
      calls.push({ name, b });
      if (name === 'importar-folha') return send(200, { rows: 3, job_id: b.job_id, simulated: true });
      if (name === 'agentes') return send(200, { ok: true, simulated: true, proposals: 0 });
      return send(200, { ok: true, simulated: true });
    }
    if (url.pathname === '/__calls') return send(200, calls);
    send(404, { error: 'not found' });
  } catch (e) { send(500, { message: e.message }); }
}).listen(PORT, '127.0.0.1', () => console.log(`mock supabase :${PORT}`));

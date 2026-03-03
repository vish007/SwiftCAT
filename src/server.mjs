import { createServer } from 'node:http';
import { Store, metrics, parseMessage, redactPII, matchSet, suggestQueue } from './core.mjs';

const store = new Store();
const rateWindow = new Map();

function json(res, status, payload, correlationId) {
  res.writeHead(status, { 'content-type': 'application/json', 'x-correlation-id': correlationId });
  res.end(JSON.stringify(payload));
}

function requireRole(req, roles) {
  const role = req.headers['x-role'] || 'ops';
  return roles.includes(role);
}

function rateLimited(ip) {
  const now = Date.now();
  const arr = (rateWindow.get(ip) || []).filter((t) => now - t < 60_000);
  arr.push(now);
  rateWindow.set(ip, arr);
  return arr.length > 120;
}

async function bodyOf(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
}

export function app() {
  return createServer(async (req, res) => {
    const correlationId = req.headers['x-correlation-id'] || crypto.randomUUID?.() || String(Date.now());
    const ip = req.socket.remoteAddress || 'local';
    metrics.requests += 1;
    if (rateLimited(ip)) return json(res, 429, { error: 'rate-limited' }, correlationId);

    console.log(redactPII(`${req.method} ${req.url} cid=${correlationId}`));

    if (req.url === '/health' && req.method === 'GET') return json(res, 200, { ok: true }, correlationId);
    if (req.url === '/metrics' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      return res.end(`swiftcat_http_requests_total ${metrics.requests}\n`);
    }
    if (req.url.startsWith('/messages') && req.method === 'POST') {
      if (!requireRole(req, ['ops', 'compliance'])) return json(res, 403, { error: 'forbidden' }, correlationId);
      try {
        const parsed = parseMessage(await bodyOf(req));
        const msg = store.addMessage(parsed);
        const queue = suggestQueue(msg);
        store.addAudit('message.create', req.headers['x-user'] || 'system', msg.id);
        return json(res, 201, { ...msg, queue, traceId: correlationId }, correlationId);
      } catch (e) {
        return json(res, 400, { error: e.message }, correlationId);
      }
    }
    if (req.url.startsWith('/messages') && req.method === 'GET') {
      if (!requireRole(req, ['ops', 'compliance', 'auditor'])) return json(res, 403, { error: 'forbidden' }, correlationId);
      const u = new URL(req.url, 'http://localhost');
      const page = Number(u.searchParams.get('page') || 1);
      const pageSize = Math.min(Number(u.searchParams.get('pageSize') || 20), 100);
      return json(res, 200, store.listMessages(u.searchParams.get('type') || undefined, page, pageSize), correlationId);
    }
    if (req.url.startsWith('/match/') && req.method === 'POST') {
      if (!requireRole(req, ['ops', 'compliance'])) return json(res, 403, { error: 'forbidden' }, correlationId);
      const reference = req.url.split('/').pop();
      if (store.cache.has(reference)) return json(res, 200, { matched: store.cache.get(reference) === 'true', cached: true }, correlationId);
      const result = matchSet(store.findByReference(reference));
      store.cache.set(reference, String(result.matched));
      if (!result.matched) {
        const msgs = store.findByReference(reference);
        if (msgs.length === 1 && msgs[0].type === 'MT202') {
          const ex = store.createException(msgs[0].id, 'Unmatched MT202');
          store.addAudit('exception.open', req.headers['x-user'] || 'system', ex.id, true);
          return json(res, 200, { ...result, exceptionId: ex.id }, correlationId);
        }
      }
      store.addAudit('match.run', req.headers['x-user'] || 'system', reference);
      return json(res, 200, result, correlationId);
    }
    if (req.url.startsWith('/exceptions/') && req.url.endsWith('/close') && req.method === 'POST') {
      if (!requireRole(req, ['compliance'])) return json(res, 403, { error: 'forbidden' }, correlationId);
      const id = req.url.split('/')[2];
      const ex = store.exceptions.get(id);
      if (!ex) return json(res, 404, { error: 'not-found' }, correlationId);
      ex.status = 'closed';
      store.addAudit('exception.close', req.headers['x-user'] || 'system', id, true);
      return json(res, 200, ex, correlationId);
    }
    if (req.url === '/audits' && req.method === 'GET') {
      if (!requireRole(req, ['auditor', 'compliance'])) return json(res, 403, { error: 'forbidden' }, correlationId);
      return json(res, 200, store.audits, correlationId);
    }
    return json(res, 404, { error: 'not-found' }, correlationId);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  app().listen(3000, '0.0.0.0', () => console.log('SwiftCAT listening on 3000'));
}

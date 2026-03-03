import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join } from 'node:path';
import { parseSwiftMessage } from './parser.js';
import { insertSwiftMessage, listSwiftMessages, getSwiftMessageById } from './repository.js';

const port = Number(process.env.PORT || 3000);

function log(level, msg, meta = {}) {
  console[level](`[${new Date().toISOString()}] ${msg}`, meta);
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e7) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res) {
  const path = req.url === '/' ? '/index.html' : req.url;
  const filePath = join(process.cwd(), 'public', path);
  if (!existsSync(filePath)) return false;
  const content = readFileSync(filePath);
  const ext = extname(filePath);
  const map = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
  res.writeHead(200, { 'Content-Type': map[ext] || 'text/plain' });
  res.end(content);
  return true;
}

export const app = createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/ingest/swift') {
      const body = await parseBody(req);
      const required = ['raw_message', 'message_type', 'sender_bic', 'receiver_bic', 'direction', 'value_date', 'amount', 'currency', 'external_ref'];
      const missing = required.filter((field) => body[field] === undefined || body[field] === null || body[field] === '');
      if (missing.length) return sendJson(res, 400, { error: `Missing fields: ${missing.join(', ')}` });

      const parsed = parseSwiftMessage(body.raw_message, body.message_type);
      const record = insertSwiftMessage(body, parsed);
      log('info', 'SWIFT message ingested', { external_ref: body.external_ref, mt: body.message_type });
      return sendJson(res, 200, { data: record });
    }

    if (req.method === 'GET' && req.url?.startsWith('/api/swift-messages')) {
      const url = new URL(req.url, `http://localhost:${port}`);
      const pathParts = url.pathname.split('/').filter(Boolean);
      if (pathParts.length === 3) {
        const detail = getSwiftMessageById(pathParts[2]);
        if (!detail) return sendJson(res, 404, { error: 'Message not found' });
        return sendJson(res, 200, { data: detail });
      }

      const messages = listSwiftMessages({
        ref: url.searchParams.get('ref') || undefined,
        mt_type: url.searchParams.get('mt_type') || undefined,
        status: url.searchParams.get('status') || undefined,
        from_date: url.searchParams.get('from_date') || undefined,
        to_date: url.searchParams.get('to_date') || undefined
      });
      return sendJson(res, 200, { data: messages });
    }

    if (req.method === 'GET' && serveStatic(req, res)) return;
    sendJson(res, 404, { error: 'Not found' });
  } catch (error) {
    log('error', 'Request failed', { message: error.message });
    sendJson(res, 500, { error: error.message });
  }
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => log('info', `Server running on http://localhost:${port}`));
}

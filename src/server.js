import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { db } from './db.js';
import { buildSuggestions } from './suggest.js';

const publicDir = join(process.cwd(), 'public');

function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function notFound(res) {
  json(res, 404, { error: 'Not found' });
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function messageResponse(messageId) {
  const msg = db.getMessage(messageId);
  if (!msg) return null;
  return {
    ...msg,
    links: db.getLinksForMessage(messageId),
    actions: db.getActionsForMessage(messageId),
  };
}

async function serveStatic(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const filePath = url.pathname === '/' ? '/index.html' : url.pathname;
  const absPath = join(publicDir, filePath);

  try {
    const data = await readFile(absPath);
    const ext = extname(absPath);
    const type = ext === '.html' ? 'text/html' : ext === '.js' ? 'application/javascript' : 'text/plain';
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  } catch {
    notFound(res);
  }
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const parts = url.pathname.split('/').filter(Boolean);

    if (req.method === 'GET' && url.pathname === '/messages') {
      return json(res, 200, db.listMessages());
    }

    if (parts[0] === 'messages' && parts[1]) {
      const messageId = Number(parts[1]);
      if (!db.getMessage(messageId)) return notFound(res);

      if (req.method === 'GET' && parts.length === 2) {
        return json(res, 200, messageResponse(messageId));
      }

      if (req.method === 'GET' && parts[2] === 'links') {
        return json(res, 200, db.getLinksForMessage(messageId));
      }

      if (req.method === 'POST' && parts[2] === 'links' && parts.length === 3) {
        const body = await readBody(req);
        try {
          const link = db.addLink({
            primaryMessageId: messageId,
            linkedMessageId: body.linked_message_id,
            confidence: body.confidence ?? 1,
            createdBy: 'manual',
            rationale: body.rationale || 'manual link',
          });
          return json(res, 201, link);
        } catch (e) {
          return json(res, 400, { error: e.message });
        }
      }

      if (req.method === 'POST' && parts[2] === 'links' && parts[3] === 'suggest') {
        const suggestions = buildSuggestions(db.getMessage(messageId), db.listMessages(), db.getLinksForMessage(messageId));
        return json(res, 200, suggestions);
      }

      if (req.method === 'POST' && parts[2] === 'links' && parts[3] === 'confirm') {
        const body = await readBody(req);
        try {
          const link = db.addLink({
            primaryMessageId: messageId,
            linkedMessageId: body.linked_message_id,
            confidence: body.confidence,
            createdBy: 'suggestion-confirm',
            rationale: body.rationale || 'confirmed suggested link',
          });
          return json(res, 201, link);
        } catch (e) {
          return json(res, 400, { error: e.message });
        }
      }

      if (req.method === 'POST' && parts[2] === 'links' && parts[3] === 'reject') {
        const body = await readBody(req);
        db.addAction({
          messageId,
          actionType: 'RejectLink',
          rationale: body.rationale || `rejected suggestion ${body.linked_message_id}`,
        });
        return json(res, 201, { ok: true });
      }
    }

    return serveStatic(req, res);
  });
}

if (process.argv[1].endsWith('server.js')) {
  const server = createServer();
  const port = Number(process.env.PORT || 3000);
  server.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on ${port}`);
  });
}

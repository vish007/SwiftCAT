import { randomUUID } from 'node:crypto';

export class Store {
  messages = new Map();
  byType = new Map();
  audits = [];
  exceptions = new Map();
  cache = new Map();

  addMessage(input) {
    const msg = { ...input, id: randomUUID(), createdAt: new Date().toISOString() };
    this.messages.set(msg.id, msg);
    if (!this.byType.has(msg.type)) this.byType.set(msg.type, new Set());
    this.byType.get(msg.type).add(msg.id);
    return msg;
  }

  listMessages(type, page = 1, pageSize = 20) {
    const ids = type ? [...(this.byType.get(type) || [])] : [...this.messages.keys()];
    const start = (page - 1) * pageSize;
    return { total: ids.length, items: ids.slice(start, start + pageSize).map((id) => this.messages.get(id)) };
  }

  findByReference(reference) {
    return [...this.messages.values()].filter((m) => m.reference === reference);
  }

  addAudit(action, actor, resourceId, sensitive = false) {
    const entry = { id: randomUUID(), action, actor, resourceId, sensitive, timestamp: new Date().toISOString() };
    this.audits.push(entry);
    return entry;
  }

  createException(messageId, reason) {
    const ex = { id: randomUUID(), messageId, reason, status: 'open' };
    this.exceptions.set(ex.id, ex);
    return ex;
  }
}

export function parseMessage(body) {
  const validTypes = new Set(['MT103', 'MT202', 'MT910', 'MT940', 'MT950', 'LC']);
  if (!validTypes.has(body.type)) throw new Error('invalid type');
  if (typeof body.amount !== 'number' || body.amount <= 0) throw new Error('invalid amount');
  if (!body.account || body.account.length < 4) throw new Error('invalid account');
  if (!body.reference || body.reference.length < 3) throw new Error('invalid reference');
  return body;
}

export function suggestQueue(msg) {
  if (msg.type === 'LC' && msg.category === '7') return 'risk';
  if (msg.amount > 1_000_000) return 'compliance';
  return 'reconciliation';
}

export function matchSet(messages) {
  const types = new Set(messages.map((m) => m.type));
  const recon = ['MT103', 'MT202', 'MT910'].some((t) => types.has(t));
  const settlement = ['MT940', 'MT950'].some((t) => types.has(t));
  return { matched: recon && settlement, reason: recon && settlement ? 'matched-to-ledger' : 'waiting-for-counterpart' };
}

export const metrics = { requests: 0 };

export function redactPII(text) {
  return String(text).replace(/\b\d{10,}\b/g, '[REDACTED_ACCOUNT]');
}

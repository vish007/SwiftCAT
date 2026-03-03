export class DB {
  constructor() {
    this.messages = [];
    this.messageLinks = [];
    this.messageActions = [];
    this.nextActionId = 1;
  }

  seed(messages) {
    this.messages = messages.map((m) => ({ ...m }));
  }

  getMessage(id) {
    return this.messages.find((m) => m.id === Number(id));
  }

  listMessages() {
    return this.messages;
  }

  getLinksForMessage(id) {
    const messageId = Number(id);
    return this.messageLinks.filter(
      (l) => l.primary_message_id === messageId || l.linked_message_id === messageId,
    );
  }

  hasLink(primaryMessageId, linkedMessageId) {
    const a = Number(primaryMessageId);
    const b = Number(linkedMessageId);
    return this.messageLinks.some(
      (l) =>
        (l.primary_message_id === a && l.linked_message_id === b) ||
        (l.primary_message_id === b && l.linked_message_id === a),
    );
  }

  addLink({ primaryMessageId, linkedMessageId, confidence, createdBy, rationale }) {
    const a = Number(primaryMessageId);
    const b = Number(linkedMessageId);
    if (a === b) throw new Error('Cannot self-link message');
    if (!this.getMessage(a) || !this.getMessage(b)) throw new Error('Message not found');
    if (this.hasLink(a, b)) throw new Error('Duplicate link');

    const link = {
      primary_message_id: a,
      linked_message_id: b,
      confidence: Number(confidence ?? 1),
      created_by: createdBy,
      created_at: new Date().toISOString(),
    };
    this.messageLinks.push(link);
    this.addAction({ messageId: a, actionType: createdBy === 'suggestion-confirm' ? 'ConfirmLink' : 'ManualLink', rationale });
    return link;
  }

  addAction({ messageId, actionType, rationale }) {
    const action = {
      id: this.nextActionId++,
      message_id: Number(messageId),
      action_type: actionType,
      rationale: rationale || null,
      created_at: new Date().toISOString(),
    };
    this.messageActions.push(action);
    return action;
  }

  getActionsForMessage(id) {
    return this.messageActions.filter((a) => a.message_id === Number(id));
  }
}

export const db = new DB();

db.seed([
  {
    id: 1,
    direction: 'incoming',
    raw_text: 'PAYMENT REF INV-900 TO ACME EUR 1000 BIC AAAABBCC',
    parsed: { externalRef: 'INV-900', amount: 1000, currency: 'EUR', bookingDate: '2026-03-01', senderBic: 'AAAABBCC', receiverBic: 'ZZZZDEFF' },
  },
  {
    id: 2,
    direction: 'outgoing',
    raw_text: 'SETTLEMENT INV-900 EUR 1000 BIC ZZZZDEFF TO AAAABBCC',
    parsed: { externalRef: 'INV-900', amount: 1000, currency: 'EUR', bookingDate: '2026-03-02', senderBic: 'ZZZZDEFF', receiverBic: 'AAAABBCC' },
  },
  {
    id: 3,
    direction: 'outgoing',
    raw_text: 'PAYMENT REF INV-901 EUR 500',
    parsed: { externalRef: 'INV-901', amount: 500, currency: 'EUR', bookingDate: '2026-03-10', senderBic: 'ZZZZDEFF', receiverBic: 'AAAABBCC' },
  },
]);

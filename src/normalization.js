import { parseSwiftMessage } from './parser.js';

function detectFamilyFromMt(messageType) {
  const code = Number((messageType || '').replace('MT', '').slice(0, 1));
  if (code === 1 || code === 2) return 'payments';
  if (code === 7) return 'trade';
  if (code === 9) return 'statements';
  if (code === 0) return 'admin';
  return 'unknown';
}

function detectMxType(xmlMessage, fallbackType) {
  const fromAppHdr = xmlMessage.match(/<(?:\w+:)?MsgDefIdr>([^<]+)<\/(?:\w+:)?MsgDefIdr>/)?.[1];
  const fromNs = xmlMessage.match(/urn:iso:std:iso:20022:tech:xsd:([a-z]+\.\d+\.\d+\.\d+)/i)?.[1];
  const fromRoot = xmlMessage.match(/<(?:\w+:)?(FIToFICstmrCdtTrf|BkToCstmrStmt)\b/);
  if (fromAppHdr) return fromAppHdr;
  if (fromNs) return fromNs;
  if (fromRoot?.[1] === 'FIToFICstmrCdtTrf') return 'pacs.008';
  if (fromRoot?.[1] === 'BkToCstmrStmt') return 'camt.053';
  return fallbackType || 'unknown';
}

function detectFamilyFromMx(messageType) {
  if (messageType.startsWith('pacs.')) return 'payments';
  if (messageType.startsWith('camt.053')) return 'statements';
  return 'unknown';
}

function pickTag(xml, tag) {
  return xml.match(new RegExp(`<(?:\\w+:)?${tag}>([^<]+)<\\/(?:\\w+:)?${tag}>`))?.[1] || null;
}

function isWellFormedXml(xml) {
  const tags = [...xml.matchAll(/<\/?(?:\w+:)?([A-Za-z_][\w.-]*)(?:\s[^>]*)?>/g)];
  const stack = [];
  for (const match of tags) {
    const raw = match[0];
    const name = match[1];
    if (raw.startsWith('</')) {
      const top = stack.pop();
      if (top !== name) return false;
      continue;
    }
    if (raw.endsWith('/>') || raw.startsWith('<?') || raw.startsWith('<!')) continue;
    stack.push(name);
  }
  return stack.length === 0;
}

export function normalizeMT(rawMessage, messageType) {
  const parsed = parseSwiftMessage(rawMessage, messageType);
  const family = detectFamilyFromMt(parsed.mt || messageType);
  const errors = [];
  if (!parsed.ref) errors.push('Missing :20: reference');
  if (!parsed.amount) errors.push('Missing :32A: amount/currency/date');

  return {
    format: 'MT',
    message_type: parsed.mt || messageType || 'unknown',
    family,
    entities: {
      refs: { transaction_reference: parsed.ref },
      parties: parsed.parties,
      amounts: parsed.amount,
      dates: parsed.dates,
      bics: {
        sender: parsed.parties?.sender || null,
        receiver: parsed.parties?.receiver || null
      }
    },
    normalized_payload: {
      ...parsed,
      format: 'MT'
    },
    validation_status: errors.length ? 'warning' : 'valid',
    validation_errors: errors
  };
}

export function normalizeMX(xmlMessage, messageType) {
  const errors = [];
  const trimmed = (xmlMessage || '').trim();
  const seemsXml = trimmed.startsWith('<') && trimmed.endsWith('>');
  const wellFormed = seemsXml && isWellFormedXml(trimmed);
  if (!seemsXml) errors.push('Payload is not XML');
  if (seemsXml && !wellFormed) errors.push('XML is not well-formed');

  const detectedType = detectMxType(trimmed, messageType);
  const family = detectFamilyFromMx(detectedType);

  const amountValue = pickTag(trimmed, 'IntrBkSttlmAmt') || pickTag(trimmed, 'Amt');
  const amountCurrency = trimmed.match(/<(?:\w+:)?(?:IntrBkSttlmAmt|Amt)\s+Ccy="([A-Z]{3})"/)?.[1] || null;
  const transactionRef = pickTag(trimmed, 'EndToEndId') || pickTag(trimmed, 'InstrId') || pickTag(trimmed, 'MsgId');

  const entities = {
    refs: {
      message_id: pickTag(trimmed, 'MsgId'),
      end_to_end_id: pickTag(trimmed, 'EndToEndId'),
      transaction_reference: transactionRef
    },
    parties: {
      debtor_name: pickTag(trimmed, 'Nm'),
      debtor_bic: pickTag(trimmed, 'BICFI'),
      creditor_name: null,
      creditor_bic: null
    },
    amounts: {
      currency: amountCurrency,
      value: amountValue ? Number(amountValue.replace(',', '.')) : null
    },
    dates: {
      value_date: pickTag(trimmed, 'IntrBkSttlmDt') || pickTag(trimmed, 'CreDtTm') || null
    },
    schema: {
      detected_message_type: detectedType,
      xsd_validation: {
        status: 'not_performed',
        reason: 'XSD validation hook placeholder'
      }
    }
  };

  const validation_status = errors.length ? 'invalid' : 'valid';

  return {
    format: 'MX',
    message_type: detectedType,
    family,
    entities,
    normalized_payload: {
      format: 'MX',
      schema_version: detectedType,
      references: entities.refs,
      amounts: entities.amounts,
      dates: entities.dates
    },
    validation_status,
    validation_errors: errors
  };
}

export function normalizeMessage(rawMessage, messageType) {
  return String(messageType || '').toUpperCase().startsWith('MT')
    ? normalizeMT(rawMessage, messageType)
    : normalizeMX(rawMessage, messageType);
}

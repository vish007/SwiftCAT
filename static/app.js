async function postJson(url, body) {
  const r = await fetch(url, {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)
  });
  return r.json();
}

function showInsight(data) {
  document.getElementById('insights-output').textContent = JSON.stringify(data, null, 2);
}

async function runInsight(kind) {
  const messageId = window.messageId || 'msg-100';
  const message = await (await fetch(`/api/messages/${messageId}`)).json();
  if (kind === 'suggest') showInsight(await postJson('/ai/suggest/match-candidates', {message}));
  if (kind === 'explain') showInsight(await postJson('/ai/explain/unmatched', {message}));
  if (kind === 'risk') showInsight(await postJson('/ai/risk/score', {message}));
  if (kind === 'draft') showInsight(await postJson('/ai/draft/action', {message, action: 'escalate'}));
}

async function confirmSuggestedMatch() {
  const message = await (await fetch(`/api/messages/${window.messageId}`)).json();
  const draft = await postJson('/ai/draft/action', {message, action: 'confirm_match'});
  if (!draft.payload.transaction_id) {
    alert('No suggested transaction to confirm');
    return;
  }
  const result = await postJson('/business/confirm-match', {
    ...draft.payload,
    user_id: 'analyst_1',
    ai_rationale: draft.rationale,
  });
  document.getElementById('message-status').textContent = result.message.status;
  showInsight({confirmed: result, ai_rationale_audited: true});
}

function sendChat() {
  const value = document.getElementById('ai-input').value;
  const log = document.getElementById('ai-log');
  const p = document.createElement('p');
  p.textContent = `AI widget note: ${value}`;
  log.prepend(p);
}

async function hydrateRiskPills() {
  const pills = document.querySelectorAll('[data-risk-message]');
  for (const pill of pills) {
    const message = await (await fetch(`/api/messages/${pill.dataset.riskMessage}`)).json();
    const score = await postJson('/ai/risk/score', {message});
    pill.textContent = `${score.risk_score} (${score.triggered_factors.join(', ')})`;
  }
}

hydrateRiskPills();

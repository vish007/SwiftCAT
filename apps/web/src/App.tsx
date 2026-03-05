import { FormEvent, useEffect, useMemo, useState } from 'react';

type User = { id: number; username: string; role: string };

type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  user: User;
};

type WorkItem = {
  id: number;
  messageType: string;
  domain: string | null;
  state: string;
  priority: number;
  rationale: string | null;
  queue: { id: number; name: string } | null;
  screeningResult?: { toolName: string; hit: boolean; score: number; riskFactors: string } | null;
  policyDecisions?: { id: number; policyName: string; allow: boolean; rationale: string; createdAt: string }[];
  confidence: number | null;
};

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export function App() {
  const [username, setUsername] = useState('amira');
  const [password, setPassword] = useState('password123');
  const [auth, setAuth] = useState<AuthResponse | null>(null);
  const [error, setError] = useState('');
  const [items, setItems] = useState<WorkItem[]>([]);
  const [selected, setSelected] = useState<WorkItem | null>(null);

  const roleGreeting = useMemo(() => {
    if (!auth) {
      return '';
    }
    if (auth.user.role === 'Maker') {
      return 'Welcome Maker! You can prepare Swift queue actions.';
    }
    if (auth.user.role === 'Compliance') {
      return 'Welcome Compliance! You can review audit actions.';
    }
    return 'Welcome AI Agent! Autonomous assist mode enabled.';
  }, [auth]);

  useEffect(() => {
    if (!auth) {
      return;
    }
    void loadWorkItems(auth.accessToken);
  }, [auth]);

  async function loadWorkItems(token: string) {
    const response = await fetch(`${API_BASE}/work-items`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) {
      return;
    }
    const payload = (await response.json()) as { data: WorkItem[] };
    setItems(payload.data);
  }

  async function openDetail(id: number) {
    if (!auth) {
      return;
    }
    const response = await fetch(`${API_BASE}/work-items/${id}`, {
      headers: { Authorization: `Bearer ${auth.accessToken}` }
    });
    if (!response.ok) {
      return;
    }
    const payload = (await response.json()) as { data: WorkItem };
    setSelected(payload.data);
  }

  async function ingestExample(messageType: string, rawMessage: string) {
    if (!auth) {
      return;
    }
    await fetch(`${API_BASE}/work-items/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${auth.accessToken}`
      },
      body: JSON.stringify({ messageType, rawMessage })
    });
    await loadWorkItems(auth.accessToken);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    if (!response.ok) {
      setError('Invalid credentials');
      return;
    }

    const payload = (await response.json()) as AuthResponse;
    setAuth(payload);
  }

  if (!auth) {
    return (
      <main style={{ maxWidth: 420, margin: '60px auto', fontFamily: 'sans-serif' }}>
        <h1>SwiftCat Login</h1>
        <form onSubmit={onSubmit}>
          <label htmlFor="username">Username</label>
          <input id="username" value={username} onChange={(e) => setUsername(e.target.value)} style={{ display: 'block', width: '100%', marginBottom: 10 }} />
          <label htmlFor="password">Password</label>
          <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ display: 'block', width: '100%', marginBottom: 10 }} />
          <button type="submit">Login</button>
        </form>
        {error && <p style={{ color: 'crimson' }}>{error}</p>}
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 980, margin: '40px auto', fontFamily: 'sans-serif' }}>
      <h1>SwiftCat Dashboard</h1>
      <p>Hi {auth.user.username}.</p>
      <p>{roleGreeting}</p>
      <p>Your role: <strong>{auth.user.role}</strong></p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={() => ingestExample('MT700', 'Trade message with sanction keyword for review')}>Ingest MT700 sanctions example</button>
        <button onClick={() => ingestExample('pacs.008', 'Standard pacs.008 customer transfer')}>Ingest pacs.008 example</button>
      </div>

      <h2>Work Items</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th>ID</th><th>Message</th><th>Domain</th><th>State</th><th>Queue</th><th>Priority</th><th>Why</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} onClick={() => openDetail(item.id)} style={{ cursor: 'pointer', borderTop: '1px solid #ddd' }}>
              <td>{item.id}</td>
              <td>{item.messageType}</td>
              <td>{item.domain ?? '-'}</td>
              <td>{item.state}</td>
              <td>{item.queue?.name ?? '-'}</td>
              <td>{item.priority}</td>
              <td title={item.rationale ?? 'No rationale'}>{item.rationale ? 'ℹ️' : '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {selected && (
        <section style={{ marginTop: 20, padding: 12, border: '1px solid #ccc' }}>
          <h3>Work Item #{selected.id} Detail</h3>
          <p><strong>Classification:</strong> domain={selected.domain ?? '-'}, confidence={selected.confidence ?? '-'}</p>
          <p><strong>Screening:</strong> {selected.screeningResult ? `${selected.screeningResult.toolName} hit=${String(selected.screeningResult.hit)} risk=${selected.screeningResult.riskFactors || 'none'}` : 'n/a'}</p>
          <div>
            <strong>Policy decisions:</strong>
            <ul>
              {selected.policyDecisions?.map((decision) => (
                <li key={decision.id}>{decision.policyName}: {decision.allow ? 'ALLOW' : 'DENY'} — {decision.rationale}</li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </main>
  );
}

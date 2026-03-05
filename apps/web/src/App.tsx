import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { DemoScenario } from '@swiftcat/shared';

type User = { id: number; username: string; role: string };

type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  user: User;
};

type ScenarioResponse = {
  data: DemoScenario[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  correlationId: string;
};

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export function buildScenarioDigest(scenario: DemoScenario): string {
  return `${scenario.name} | ${scenario.workItemId} | ${scenario.status} | ${scenario.timeline.map((step) => step.label).join(' -> ')}`;
}

export function App() {
  const [username, setUsername] = useState('amira');
  const [password, setPassword] = useState('password123');
  const [auth, setAuth] = useState<AuthResponse | null>(null);
  const [error, setError] = useState('');
  const [scenarios, setScenarios] = useState<DemoScenario[]>([]);
  const [loadingScenarios, setLoadingScenarios] = useState(false);

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

    const correlationId = `ui-${Date.now()}`;
    setLoadingScenarios(true);
    fetch(`${API_BASE}/demo/scenarios?page=1&pageSize=10`, {
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        'x-correlation-id': correlationId
      }
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Could not load scenarios');
        }
        const payload = (await response.json()) as ScenarioResponse;
        setScenarios(payload.data);
      })
      .catch(() => {
        setError('Unable to load banker demo scenarios');
      })
      .finally(() => {
        setLoadingScenarios(false);
      });
  }, [auth]);

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
    <main style={{ maxWidth: 900, margin: '30px auto', fontFamily: 'sans-serif' }}>
      <h1>SwiftCat Banker Demo Dashboard</h1>
      <p>Hi {auth.user.username}.</p>
      <p>{roleGreeting}</p>
      <p>Your role: <strong>{auth.user.role}</strong></p>

      <h2>Milestone R7 Scenarios</h2>
      {loadingScenarios && <p>Loading scenarios...</p>}
      {scenarios.map((scenario) => (
        <section key={scenario.id} style={{ border: '1px solid #ddd', borderRadius: 8, marginBottom: 12, padding: 12 }}>
          <h3>{scenario.name}</h3>
          <p>
            Work item <strong>{scenario.workItemId}</strong> · Classification <strong>{scenario.classification}</strong> · Status <strong>{scenario.status}</strong>
          </p>
          <ul>
            {scenario.timeline.map((step) => (
              <li key={`${scenario.id}-${step.id}`}>
                {step.label} ({step.actor}) — corr: <code>{step.correlationId}</code>
              </li>
            ))}
          </ul>
          {scenario.approvals.length > 0 && (
            <>
              <h4>Approvals</h4>
              <ul>
                {scenario.approvals.map((approval) => (
                  <li key={approval.id}>{approval.requiredRole}: {approval.status} — {approval.rationale}</li>
                ))}
              </ul>
            </>
          )}
        </section>
      ))}
      {!loadingScenarios && scenarios.length === 0 && <p>No scenarios found.</p>}
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
    </main>
  );
}

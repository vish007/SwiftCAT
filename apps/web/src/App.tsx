import { FormEvent, useEffect, useMemo, useState } from 'react';

type User = { id: number; username: string; role: string };

type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  user: User;
};

type WorkItem = {
  id: number;
  reference: string;
  status: 'RECEIVED' | 'CLASSIFIED' | 'ROUTED';
};

type AgentRun = {
  id: number;
  workItemId: number;
  status: 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  startedAt: string;
  finishedAt: string | null;
};

type AgentStep = {
  id: number;
  stepName: string;
  stepType: string;
  status: 'STARTED' | 'SUCCEEDED' | 'FAILED' | 'SKIPPED';
  rationale: string | null;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
};

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export function App() {
  const [username, setUsername] = useState('amira');
  const [password, setPassword] = useState('password123');
  const [auth, setAuth] = useState<AuthResponse | null>(null);
  const [error, setError] = useState('');
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [selectedWorkItemId, setSelectedWorkItemId] = useState<number | null>(null);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [stepsByRunId, setStepsByRunId] = useState<Record<number, AgentStep[]>>({});

  const roleGreeting = useMemo(() => {
    if (!auth) return '';
    if (auth.user.role === 'Maker') return 'Welcome Maker! You can prepare Swift queue actions.';
    if (auth.user.role === 'Compliance') return 'Welcome Compliance! You can review audit actions.';
    return 'Welcome AI Agent! Autonomous assist mode enabled.';
  }, [auth]);

  async function apiGet<T>(path: string): Promise<T> {
    if (!auth) throw new Error('Not authenticated');
    const response = await fetch(`${API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${auth.accessToken}` }
    });
    if (!response.ok) throw new Error(`Request failed: ${path}`);
    return response.json() as Promise<T>;
  }

  async function loadRuns(workItemId: number) {
    const runsResponse = await apiGet<{ data: AgentRun[] }>(`/agent/runs?workItemId=${workItemId}`);
    setRuns(runsResponse.data);

    const stepsEntries = await Promise.all(
      runsResponse.data.map(async (run) => {
        const stepsResponse = await apiGet<{ data: AgentStep[] }>(`/agent/runs/${run.id}/steps`);
        return [run.id, stepsResponse.data] as const;
      })
    );

    setStepsByRunId(Object.fromEntries(stepsEntries));
  }

  useEffect(() => {
    if (!auth) return;
    apiGet<{ data: WorkItem[] }>('/work-items')
      .then((response) => {
        setWorkItems(response.data);
        if (response.data.length > 0) {
          setSelectedWorkItemId(response.data[0].id);
        }
      })
      .catch(() => setError('Unable to load work items'));
  }, [auth]);

  useEffect(() => {
    if (!auth || selectedWorkItemId === null) return;
    loadRuns(selectedWorkItemId).catch(() => setError('Unable to load agent timeline'));
  }, [auth, selectedWorkItemId]);

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

  async function runAgent() {
    if (!auth || selectedWorkItemId === null) return;
    await fetch(`${API_BASE}/agent/run/${selectedWorkItemId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${auth.accessToken}` }
    });

    const items = await apiGet<{ data: WorkItem[] }>('/work-items');
    setWorkItems(items.data);
    await loadRuns(selectedWorkItemId);
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

  const selectedWorkItem = workItems.find((item) => item.id === selectedWorkItemId) ?? null;

  return (
    <main style={{ maxWidth: 900, margin: '40px auto', fontFamily: 'sans-serif' }}>
      <h1>SwiftCat Dashboard</h1>
      <p>Hi {auth.user.username}.</p>
      <p>{roleGreeting}</p>
      <p>Your role: <strong>{auth.user.role}</strong></p>

      <section style={{ marginTop: 24 }}>
        <h2>Work Items</h2>
        <ul>
          {workItems.map((item) => (
            <li key={item.id}>
              <button type="button" onClick={() => setSelectedWorkItemId(item.id)}>
                {item.reference} — {item.status}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {selectedWorkItem && (
        <section style={{ marginTop: 24 }}>
          <h2>Work Item Detail</h2>
          <p>Reference: <strong>{selectedWorkItem.reference}</strong></p>
          <p>Status: <strong>{selectedWorkItem.status}</strong></p>
          <button type="button" onClick={() => runAgent().catch(() => setError('Agent run failed'))}>Run Agent</button>

          <h3 style={{ marginTop: 20 }}>Agent Timeline</h3>
          {runs.length === 0 && <p>No runs yet.</p>}
          {runs.map((run) => (
            <div key={run.id} style={{ border: '1px solid #ddd', padding: 12, marginBottom: 12 }}>
              <p>
                Run #{run.id} — <strong>{run.status}</strong>
              </p>
              <p>Started: {new Date(run.startedAt).toLocaleString()}</p>
              {stepsByRunId[run.id]?.map((step) => (
                <details key={step.id} style={{ marginBottom: 8 }}>
                  <summary>{step.stepType} / {step.stepName} — {step.status}</summary>
                  <p>{step.rationale}</p>
                  <pre>input: {JSON.stringify(step.input, null, 2)}</pre>
                  <pre>output: {JSON.stringify(step.output, null, 2)}</pre>
                </details>
              ))}
            </div>
          ))}
        </section>
      )}

      {error && <p style={{ color: 'crimson' }}>{error}</p>}
    </main>
  );
}

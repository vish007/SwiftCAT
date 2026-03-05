import { FormEvent, useEffect, useMemo, useState } from 'react';

type User = { id: number; username: string; role: string };

type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  user: User;
};

type ApprovalRecord = {
  id: number;
  actionType: string;
  state: 'PENDING' | 'APPROVED' | 'REJECTED';
  makerUserId: number | null;
  checkerUserId: number | null;
  workItem: {
    id: number;
    state: string;
  };
};

type WorkItemRecord = {
  id: number;
  actionType: string;
  state: string;
  approvals: ApprovalRecord[];
};

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export function App() {
  const [username, setUsername] = useState('amira');
  const [password, setPassword] = useState('password123');
  const [auth, setAuth] = useState<AuthResponse | null>(null);
  const [error, setError] = useState('');
  const [approvals, setApprovals] = useState<ApprovalRecord[]>([]);
  const [workItems, setWorkItems] = useState<WorkItemRecord[]>([]);

  const roleGreeting = useMemo(() => {
    if (!auth) {
      return '';
    }
    if (auth.user.role === 'Maker') {
      return 'Welcome Maker! Review and approve the first stage of gated actions.';
    }
    if (auth.user.role === 'Checker' || auth.user.role === 'Compliance') {
      return 'Welcome Checker! You provide final authorization for sensitive actions.';
    }
    return 'Welcome AI Agent! Propose actions and wait for approvals.';
  }, [auth]);

  async function fetchInbox(session: AuthResponse) {
    const [approvalRes, workItemsRes] = await Promise.all([
      fetch(`${API_BASE}/approvals/inbox`, {
        headers: { Authorization: `Bearer ${session.accessToken}` }
      }),
      fetch(`${API_BASE}/work-items`, {
        headers: { Authorization: `Bearer ${session.accessToken}` }
      })
    ]);

    if (approvalRes.ok) {
      const payload = (await approvalRes.json()) as { data: ApprovalRecord[] };
      setApprovals(payload.data);
    }
    if (workItemsRes.ok) {
      const payload = (await workItemsRes.json()) as { data: WorkItemRecord[] };
      setWorkItems(payload.data);
    }
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

  async function proposeOutboundSend() {
    if (!auth) {
      return;
    }

    await fetch(`${API_BASE}/work-items/propose`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        actionType: 'OUTBOUND_SWIFT_SEND',
        payload: {
          mtType: 'MT700',
          instruction: 'Draft amendment send'
        },
        isHighRisk: true
      })
    });

    await fetchInbox(auth);
  }

  async function decide(approvalId: number, decision: 'APPROVED' | 'REJECTED') {
    if (!auth) {
      return;
    }
    await fetch(`${API_BASE}/approvals/${approvalId}/decision`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ decision })
    });
    await fetchInbox(auth);
  }

  useEffect(() => {
    if (auth) {
      void fetchInbox(auth);
    }
  }, [auth]);

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
    <main style={{ maxWidth: 760, margin: '60px auto', fontFamily: 'sans-serif' }}>
      <h1>SwiftCat Dashboard</h1>
      <p>Hi {auth.user.username}.</p>
      <p>{roleGreeting}</p>
      <p>Your role: <strong>{auth.user.role}</strong></p>

      {auth.user.role === 'AI_Agent' && <button onClick={proposeOutboundSend}>Propose outbound SWIFT send</button>}

      <section style={{ marginTop: 24 }}>
        <h2>Approval Inbox</h2>
        {approvals.length === 0 ? <p>No pending approvals for your role.</p> : (
          <ul>
            {approvals.map((approval) => (
              <li key={approval.id} style={{ marginBottom: 12 }}>
                #{approval.id} · {approval.actionType} · work item #{approval.workItem.id}
                <div>
                  <button onClick={() => decide(approval.id, 'APPROVED')}>Approve</button>
                  <button onClick={() => decide(approval.id, 'REJECTED')} style={{ marginLeft: 8 }}>Reject</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>Work Items</h2>
        <ul>
          {workItems.map((item) => (
            <li key={item.id}>
              #{item.id} · {item.actionType} · state: <strong>{item.state}</strong> · pending approvals: {item.approvals.filter((a) => a.state === 'PENDING').length}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

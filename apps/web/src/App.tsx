import { FormEvent, useMemo, useState } from 'react';

type User = { id: number; username: string; role: string };

type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  user: User;
};

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export function App() {
  const [username, setUsername] = useState('amira');
  const [password, setPassword] = useState('password123');
  const [auth, setAuth] = useState<AuthResponse | null>(null);
  const [error, setError] = useState('');

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
    <main style={{ maxWidth: 640, margin: '60px auto', fontFamily: 'sans-serif' }}>
      <h1>SwiftCat Dashboard</h1>
      <p>Hi {auth.user.username}.</p>
      <p>{roleGreeting}</p>
      <p>Your role: <strong>{auth.user.role}</strong></p>
    </main>
  );
}

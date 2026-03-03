import { describe, expect, it } from 'vitest';
import { loginSchema } from './index';

describe('shared validators', () => {
  it('validates login payload', () => {
    const parsed = loginSchema.parse({ username: 'amira', password: 'password123' });
    expect(parsed.username).toBe('amira');
  });
});

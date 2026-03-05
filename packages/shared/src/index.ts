import { z } from 'zod';

export const Role = z.enum(['Maker', 'Compliance', 'AI_Agent']);
export type Role = z.infer<typeof Role>;

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(6)
});

export type LoginInput = z.infer<typeof loginSchema>;

export type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  user: {
    id: number;
    username: string;
    role: Role;
  };
};

export * from './demo';

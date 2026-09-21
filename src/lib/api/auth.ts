import { apiFetch } from '@/lib/api/client';
import { clearSession, saveSession, type SessionSnapshot } from '@/lib/api/session';

interface TokenResponse {
  access_token: string;
  token_type: 'bearer';
}

export interface ApiUser {
  id: number;
  email: string;
  created_at: string;
}

async function authenticate(path: '/auth/register' | '/auth/login', email: string, password: string) {
  const auth = await apiFetch<TokenResponse>(path, { method: 'POST', body: { email, password } });
  const user = await fetchMe(auth.access_token);
  await saveSession(user.email, auth.access_token);
  return { ready: true, email: user.email, token: auth.access_token } satisfies SessionSnapshot;
}

export function register(email: string, password: string): Promise<SessionSnapshot> {
  return authenticate('/auth/register', email, password);
}

export function login(email: string, password: string): Promise<SessionSnapshot> {
  return authenticate('/auth/login', email, password);
}

export function fetchMe(token: string): Promise<ApiUser> {
  return apiFetch<ApiUser>('/auth/me', { token });
}

export function signOut(): Promise<void> {
  return clearSession();
}

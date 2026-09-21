/** Browsers do not expose SecureStore; web remains a demo surface backed by localStorage. */
const SESSION_KEY = 'orbit.session.v1';

export async function readStoredSession(): Promise<string | null> {
  return globalThis.localStorage?.getItem(SESSION_KEY) ?? null;
}

export async function writeStoredSession(value: string): Promise<void> {
  globalThis.localStorage?.setItem(SESSION_KEY, value);
}

export async function deleteStoredSession(): Promise<void> {
  globalThis.localStorage?.removeItem(SESSION_KEY);
}

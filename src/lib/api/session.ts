import { useSyncExternalStore } from 'react';

import {
  deleteStoredSession,
  readStoredSession,
  writeStoredSession,
} from '@/lib/api/token-storage';
import { resetSyncState } from '@/lib/settings';

export interface SessionSnapshot {
  ready: boolean;
  email: string | null;
  token: string | null;
}

let snapshot: SessionSnapshot = { ready: false, email: null, token: null };
let loadPromise: Promise<SessionSnapshot> | null = null;
const listeners = new Set<() => void>();

function emit(next: SessionSnapshot): void {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSession(): SessionSnapshot {
  return snapshot;
}

export function ensureSessionLoaded(): Promise<SessionSnapshot> {
  if (snapshot.ready) return Promise.resolve(snapshot);
  if (!loadPromise) {
    loadPromise = readStoredSession()
      .then((raw) => {
        if (!raw) return { ready: true, email: null, token: null } satisfies SessionSnapshot;
        try {
          const parsed = JSON.parse(raw) as Partial<SessionSnapshot>;
          if (typeof parsed.email === 'string' && typeof parsed.token === 'string') {
            return { ready: true, email: parsed.email, token: parsed.token } satisfies SessionSnapshot;
          }
        } catch {
          // Corrupt credentials are treated as signed out and replaced on the next sign-in.
        }
        return { ready: true, email: null, token: null } satisfies SessionSnapshot;
      })
      .catch(() => ({ ready: true, email: null, token: null }) satisfies SessionSnapshot)
      .then((loaded) => {
        emit(loaded);
        return loaded;
      });
  }
  return loadPromise;
}

export async function saveSession(email: string, token: string): Promise<void> {
  const previous = await ensureSessionLoaded();
  const normalizedEmail = email.trim().toLowerCase();
  if (previous.email !== normalizedEmail) resetSyncState();
  await writeStoredSession(JSON.stringify({ email: normalizedEmail, token }));
  emit({ ready: true, email: normalizedEmail, token });
}

export async function clearSession(): Promise<void> {
  await deleteStoredSession();
  resetSyncState();
  emit({ ready: true, email: null, token: null });
}

export function useSession(): SessionSnapshot {
  void ensureSessionLoaded();
  return useSyncExternalStore(subscribeSession, getSession, getSession);
}

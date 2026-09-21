/**
 * Foreground sync orchestration. Background-task uploads are deliberately
 * deferred until battery behavior is measured in Part 2.
 */
import { useSyncExternalStore } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { signOut } from '@/lib/api/auth';
import { uploadPoints } from '@/lib/api/locations';
import {
  ensureSessionLoaded,
  getSession,
  subscribeSession,
} from '@/lib/api/session';
import { subscribeToData } from '@/lib/db/events';
import { store } from '@/lib/db/store';
import { settings } from '@/lib/settings';
import { nextDelay } from '@/lib/sync/backoff';
import { runSync, type SyncResult } from '@/lib/sync/sync-engine';

const DATA_CHANGE_DEBOUNCE_MS = 30_000;

export interface SyncStatus {
  state: 'idle' | 'syncing' | 'error' | 'offline';
  pending: number;
  lastSyncAt: number | null;
  lastError: string | null;
}

export interface SyncServiceDeps {
  execute(): Promise<SyncResult | null>;
  getPending(): Promise<number>;
  random(): number;
}

const initialStatus: SyncStatus = {
  state: 'idle',
  pending: 0,
  lastSyncAt: settings.get('lastSyncAt'),
  lastError: null,
};

export class SyncService {
  private inFlight: Promise<SyncResult | null> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private status: SyncStatus = initialStatus;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly deps: SyncServiceDeps) {}

  getSnapshot = (): SyncStatus => this.status;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private update(patch: Partial<SyncStatus>): void {
    this.status = { ...this.status, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  async refreshPending(): Promise<void> {
    this.update({ pending: await this.deps.getPending(), lastSyncAt: settings.get('lastSyncAt') });
  }

  sync(): Promise<SyncResult | null> {
    if (this.inFlight) return this.inFlight;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.inFlight = this.perform().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async perform(): Promise<SyncResult | null> {
    this.update({ state: 'syncing', lastError: null });
    const result = await this.deps.execute();
    await this.refreshPending();
    if (result == null) {
      this.attempt = 0;
      this.update({ state: 'idle' });
      return null;
    }
    if (result.done) {
      this.attempt = 0;
      this.update({ state: 'idle', lastError: null });
      return result;
    }

    const failure = result.error;
    this.update({
      state: failure?.isNetworkError ? 'offline' : 'error',
      lastError: failure?.message ?? 'Sync stopped before it completed.',
    });
    if (failure?.retryable) {
      const delay = nextDelay(this.attempt, this.deps.random);
      this.attempt += 1;
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        void this.sync();
      }, delay);
    }
    return result;
  }

  stop(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }
}

async function countPending(): Promise<number> {
  let afterId = settings.get('lastSyncedPointId');
  let count = 0;
  while (true) {
    const points = await store.getPointsAfterId(afterId, 1000);
    count += points.length;
    if (points.length < 1000) return count;
    afterId = points[points.length - 1].id ?? afterId;
  }
}

const syncService = new SyncService({
  async execute() {
    const session = await ensureSessionLoaded();
    if (!session.token) return null;
    return runSync({
      store,
      api: {
        upload: (points) => uploadPoints(points, session.token as string),
        signOut,
      },
      getCursor: () => settings.get('lastSyncedPointId'),
      setCursor: (pointId, syncedAt) => {
        settings.set('lastSyncedPointId', pointId);
        settings.set('lastSyncAt', syncedAt);
      },
      now: Date.now,
    });
  },
  getPending: countPending,
  random: Math.random,
});

let stopService: (() => void) | null = null;

export function startSyncService(): () => void {
  if (stopService) return stopService;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const triggerIfSignedIn = () => {
    if (getSession().token) void syncService.sync();
    else void syncService.refreshPending();
  };
  const unsubscribeSession = subscribeSession(triggerIfSignedIn);
  const unsubscribeData = subscribeToData(() => {
    void syncService.refreshPending();
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(triggerIfSignedIn, DATA_CHANGE_DEBOUNCE_MS);
  });
  const appState = AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'active') triggerIfSignedIn();
  });

  void ensureSessionLoaded().then(triggerIfSignedIn);
  void syncService.refreshPending();
  stopService = () => {
    unsubscribeSession();
    unsubscribeData();
    appState.remove();
    if (debounceTimer) clearTimeout(debounceTimer);
    syncService.stop();
    stopService = null;
  };
  return stopService;
}

export function syncNow(): Promise<SyncResult | null> {
  return syncService.sync();
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(syncService.subscribe, syncService.getSnapshot, syncService.getSnapshot);
}

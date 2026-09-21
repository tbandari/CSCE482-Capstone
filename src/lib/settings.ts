/**
 * Small typed key-value settings on top of localStorage. On native the
 * expo-sqlite polyfill provides `localStorage`; on web it is the browser's.
 */

import '@/lib/storage/install-local-storage';

import { useSyncExternalStore } from 'react';

export interface Settings {
  onboardingComplete: boolean;
  trackingEnabled: boolean;
  /** Highest local point id acknowledged by the current cloud account. */
  lastSyncedPointId: number;
  lastSyncAt: number | null;
}

const DEFAULTS: Settings = {
  onboardingComplete: false,
  trackingEnabled: false,
  lastSyncedPointId: 0,
  lastSyncAt: null,
};

const PREFIX = 'orbit.settings.';

type Listener = () => void;
const listeners = new Map<keyof Settings, Set<Listener>>();

function read<K extends keyof Settings>(key: K): Settings[K] {
  try {
    const raw = globalThis.localStorage?.getItem(PREFIX + key);
    if (raw == null) return DEFAULTS[key];
    return JSON.parse(raw) as Settings[K];
  } catch {
    return DEFAULTS[key];
  }
}

function write<K extends keyof Settings>(key: K, value: Settings[K]): void {
  try {
    globalThis.localStorage?.setItem(PREFIX + key, JSON.stringify(value));
  } catch (error) {
    console.warn('settings: could not persist', key, error);
  }
  listeners.get(key)?.forEach((listener) => listener());
}

function subscribe<K extends keyof Settings>(key: K, listener: Listener): () => void {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(listener);
  return () => {
    set?.delete(listener);
  };
}

export const settings = { get: read, set: write, subscribe };

/** A different account must replay the full outbox; server-side dedupe makes that safe. */
export function resetSyncState(): void {
  write('lastSyncedPointId', 0);
  write('lastSyncAt', null);
}

export function useSetting<K extends keyof Settings>(key: K): Settings[K] {
  return useSyncExternalStore(
    (listener) => subscribe(key, listener),
    () => read(key),
    () => DEFAULTS[key],
  );
}

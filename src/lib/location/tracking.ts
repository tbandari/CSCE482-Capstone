/**
 * Tracking service: owns permissions, the background task and the foreground
 * fallback, and exposes a tiny observable status for the UI.
 *
 * Modes:
 *  - background: OS delivers batched fixes to the task in `background-task.ts`
 *    even when the app is closed. Needs "Always" permission and a dev build.
 *  - foreground: `watchPositionAsync` while the app is open. What Expo Go allows.
 *  - off.
 */

import * as Location from 'expo-location';
import { useSyncExternalStore } from 'react';

import { store } from '@/lib/db/store';
import * as background from '@/lib/location/background-task';
import { toPoint } from '@/lib/location/to-point';
import { settings } from '@/lib/settings';

export type TrackingMode = 'off' | 'foreground' | 'background';

export interface TrackingStatus {
  mode: TrackingMode;
  foregroundGranted: boolean;
  backgroundGranted: boolean;
  backgroundAvailable: boolean;
  lastFixTs: number | null;
  error: string | null;
}

let status: TrackingStatus = {
  mode: 'off',
  foregroundGranted: false,
  backgroundGranted: false,
  backgroundAvailable: false,
  lastFixTs: null,
  error: null,
};

let watcher: Location.LocationSubscription | null = null;
const listeners = new Set<() => void>();

function update(patch: Partial<TrackingStatus>): void {
  status = { ...status, ...patch };
  listeners.forEach((listener) => listener());
}

const describe = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function getTrackingStatus(): TrackingStatus {
  return status;
}

export function subscribeTracking(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useTrackingStatus(): TrackingStatus {
  return useSyncExternalStore(subscribeTracking, getTrackingStatus, getTrackingStatus);
}

export async function refreshPermissions(): Promise<void> {
  try {
    const [foreground, backgroundPermission, available] = await Promise.all([
      Location.getForegroundPermissionsAsync(),
      Location.getBackgroundPermissionsAsync(),
      background.isBackgroundAvailable(),
    ]);
    update({
      foregroundGranted: foreground.granted,
      backgroundGranted: backgroundPermission.granted,
      backgroundAvailable: available,
    });
  } catch (error) {
    update({ error: describe(error) });
  }
}

async function startForegroundWatcher(): Promise<void> {
  if (watcher) return;
  watcher = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.Balanced, timeInterval: 30_000, distanceInterval: 20 },
    (location) => {
      update({ lastFixTs: location.timestamp });
      store.insertPoints([toPoint(location)]).catch((error) => {
        update({ error: `Could not store fix: ${describe(error)}` });
      });
    },
  );
}

function stopForegroundWatcher(): void {
  watcher?.remove();
  watcher = null;
}

/** Asks for permission (foreground, then background where possible) and starts recording. */
export async function startTracking(): Promise<TrackingStatus> {
  update({ error: null });
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (!foreground.granted) {
    settings.set('trackingEnabled', false);
    update({ foregroundGranted: false, mode: 'off', error: 'Location permission was not granted.' });
    return status;
  }
  update({ foregroundGranted: true });
  settings.set('trackingEnabled', true);

  const available = await background.isBackgroundAvailable();
  update({ backgroundAvailable: available });
  if (available) {
    const permission = await Location.requestBackgroundPermissionsAsync();
    update({ backgroundGranted: permission.granted });
    if (permission.granted) {
      try {
        await background.startBackgroundUpdates();
        stopForegroundWatcher();
        update({ mode: 'background' });
        return status;
      } catch (error) {
        update({ error: `Background updates unavailable: ${describe(error)}` });
      }
    }
  }

  await startForegroundWatcher();
  update({ mode: 'foreground' });
  return status;
}

export async function stopTracking(): Promise<void> {
  settings.set('trackingEnabled', false);
  stopForegroundWatcher();
  try {
    await background.stopBackgroundUpdates();
  } catch (error) {
    update({ error: describe(error) });
  }
  update({ mode: 'off' });
}

/** Called on launch: re-attach to a running background task or restart the foreground watcher. */
export async function resumeTrackingIfEnabled(): Promise<void> {
  await refreshPermissions();
  if (!settings.get('trackingEnabled')) return;

  if (await background.isBackgroundRunning()) {
    update({ mode: 'background' });
    return;
  }
  if (!status.foregroundGranted) {
    update({ mode: 'off', error: 'Location permission was revoked. Re-enable it in Settings.' });
    return;
  }
  if (status.backgroundAvailable && status.backgroundGranted) {
    try {
      await background.startBackgroundUpdates();
      update({ mode: 'background' });
      return;
    } catch (error) {
      update({ error: `Background updates unavailable: ${describe(error)}` });
    }
  }
  await startForegroundWatcher();
  update({ mode: 'foreground' });
}

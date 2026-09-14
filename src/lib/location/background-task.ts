/**
 * Background location task. Must be imported from the root layout so
 * `defineTask` runs at module scope: when iOS or Android wakes the app in the
 * background there is no React tree, only this module.
 *
 * Expo Go cannot run this (TaskManager is unavailable on Android and has no
 * background execution on iOS); a development build is required. The tracking
 * service falls back to a foreground watcher when this is not available.
 */

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { store } from '@/lib/db/store';
import { toPoint } from '@/lib/location/to-point';

export const LOCATION_TASK_NAME = 'orbit-location-updates';

interface LocationTaskData {
  locations: Location.LocationObject[];
}

if (!TaskManager.isTaskDefined(LOCATION_TASK_NAME)) {
  TaskManager.defineTask<LocationTaskData>(LOCATION_TASK_NAME, async ({ data, error }) => {
    if (error) {
      console.warn('background location task error', error.message);
      return;
    }
    if (!data?.locations?.length) return;
    try {
      await store.insertPoints(data.locations.map(toPoint));
    } catch (storeError) {
      console.warn('background location task could not store points', storeError);
    }
  });
}

export async function isBackgroundAvailable(): Promise<boolean> {
  try {
    return await TaskManager.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function isBackgroundRunning(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
  } catch {
    return false;
  }
}

export async function startBackgroundUpdates(): Promise<void> {
  await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 60_000,
    distanceInterval: 25,
    deferredUpdatesInterval: 60_000,
    deferredUpdatesDistance: 50,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: false,
    foregroundService: {
      notificationTitle: 'Orbit is recording your timeline',
      notificationBody: 'Location stays on this phone until you choose to sync.',
      notificationColor: '#2563EB',
    },
  });
}

export async function stopBackgroundUpdates(): Promise<void> {
  if (await isBackgroundRunning()) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }
}

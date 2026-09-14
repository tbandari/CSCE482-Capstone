/** Browsers have no background location; every call here is a no-op. */

export const LOCATION_TASK_NAME = 'orbit-location-updates';

export async function isBackgroundAvailable(): Promise<boolean> {
  return false;
}

export async function isBackgroundRunning(): Promise<boolean> {
  return false;
}

export async function startBackgroundUpdates(): Promise<void> {
  throw new Error('Background location is not available on web.');
}

export async function stopBackgroundUpdates(): Promise<void> {}

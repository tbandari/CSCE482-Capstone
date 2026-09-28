import { signOut } from '@/lib/api/auth';
import { store as webStore } from '@/lib/db/store.web';
import { settings } from '@/lib/settings';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));

jest.mock('@/lib/storage/install-local-storage', () => {
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
      removeItem: (key: string) => data.delete(key),
      clear: () => data.clear(),
    },
  });
  return {};
});

describe('sync cursor reset', () => {
  test('sign-out resets the cursor and last-sync time', async () => {
    settings.set('lastSyncedPointId', 42);
    settings.set('lastSyncAt', 1234);
    settings.set('serverVisitsSyncedAt', 5678);
    await signOut();
    expect(settings.get('lastSyncedPointId')).toBe(0);
    expect(settings.get('lastSyncAt')).toBeNull();
    expect(settings.get('serverVisitsSyncedAt')).toBe(0);
  });

  test('clearAll resets the cursor and last-sync time', async () => {
    settings.set('lastSyncedPointId', 42);
    settings.set('lastSyncAt', 1234);
    settings.set('serverVisitsSyncedAt', 5678);
    await webStore.clearAll();
    expect(settings.get('lastSyncedPointId')).toBe(0);
    expect(settings.get('lastSyncAt')).toBeNull();
    expect(settings.get('serverVisitsSyncedAt')).toBe(0);
  });
});

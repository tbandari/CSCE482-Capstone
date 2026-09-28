import { migrateStore, SCHEMA_VERSION } from '@/lib/db/store';

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));
jest.mock('@/lib/storage/install-local-storage', () => ({}));

test('the version one to version two migration keeps existing visits', async () => {
  const visits = [{ id: 9, start_ts: 100, label: 'Home' }];
  let version = 1;
  const columns = new Set(['id', 'start_ts', 'label']);
  const db = {
    async getFirstAsync() {
      return { user_version: version };
    },
    async execAsync(sql: string) {
      for (const match of sql.matchAll(/ADD COLUMN (\w+)/g)) columns.add(match[1]);
      const next = sql.match(/PRAGMA user_version = (\d+)/);
      if (next) version = Number(next[1]);
    },
  };

  await migrateStore(db as never);

  expect(version).toBe(SCHEMA_VERSION);
  expect(columns).toEqual(
    new Set([
      'id',
      'start_ts',
      'label',
      'place_id',
      'place_name',
      'place_category',
      'place_confidence',
    ]),
  );
  expect(visits).toEqual([{ id: 9, start_ts: 100, label: 'Home' }]);
});

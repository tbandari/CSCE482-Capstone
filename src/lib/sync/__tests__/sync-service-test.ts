import { SyncService } from '@/lib/sync/sync-service';
import type { SyncResult } from '@/lib/sync/sync-engine';

test('two concurrent sync calls share one run', async () => {
  let finish: (value: SyncResult) => void = () => {};
  const execute = jest.fn(
    () =>
      new Promise<SyncResult>((resolve) => {
        finish = resolve;
      }),
  );
  const service = new SyncService({ execute, getPending: async () => 0, random: () => 0 });

  const first = service.sync();
  const second = service.sync();
  expect(first).toBe(second);
  expect(execute).toHaveBeenCalledTimes(1);

  finish({ uploaded: 1, duplicates: 0, batches: 1, done: true });
  await expect(first).resolves.toMatchObject({ done: true });
});

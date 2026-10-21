import { Share } from 'react-native';

import { apiFetch } from '@/lib/api/client';
import { store } from '@/lib/db/store';

/** Everything Orbit holds about you: what is on this device, plus the server's full export when signed in. */
export async function buildExport(token: string | null) {
  const [points, visits, imports] = await Promise.all([store.getPoints(), store.getVisits(), store.listImports()]);
  return {
    exported_at: Date.now(),
    device: { points, visits, imports },
    account: token ? await apiFetch<unknown>('/export', { token }) : null,
  };
}

/** Downloads the export as a JSON file on web; opens the share sheet on a phone. */
export async function saveExport(data: object): Promise<void> {
  const json = JSON.stringify(data, null, 2);
  const name = `orbit-export-${new Date().toISOString().slice(0, 10)}.json`;
  if (process.env.EXPO_OS === 'web') {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
    return;
  }
  // shortcut: shares the JSON as text; write a file and use expo-sharing if exports outgrow the share sheet.
  await Share.share({ title: name, message: json });
}

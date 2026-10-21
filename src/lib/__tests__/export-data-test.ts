import { apiFetch } from '@/lib/api/client';
import { buildExport } from '@/lib/export-data';

jest.mock('@/lib/api/client', () => ({ apiFetch: jest.fn() }));
jest.mock('@/lib/db/store', () => ({
  store: {
    getPoints: jest.fn(async () => [{ ts: 1, lat: 30.6, lon: -96.3 }]),
    getVisits: jest.fn(async () => [{ id: 1 }]),
    listImports: jest.fn(async () => []),
  },
}));

describe('buildExport', () => {
  beforeEach(() => jest.mocked(apiFetch).mockReset());

  test('signed out: exports only what is on this device', async () => {
    const data = await buildExport(null);
    expect(data.device.points).toHaveLength(1);
    expect(data.device.visits).toHaveLength(1);
    expect(data.account).toBeNull();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  test('signed in: includes the server export', async () => {
    jest.mocked(apiFetch).mockResolvedValue({ points: [], recommendation_feedback: [] });
    const data = await buildExport('token');
    expect(apiFetch).toHaveBeenCalledWith('/export', { token: 'token' });
    expect(data.account).toEqual({ points: [], recommendation_feedback: [] });
  });
});

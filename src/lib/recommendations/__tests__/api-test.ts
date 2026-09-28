import {
  fetchNearbyRecommendations,
  fetchNextPlaces,
  fetchRecommendations,
  sendFeedback,
} from '@/lib/recommendations/api';

function mockFetch(status = 200, body: unknown = { generated_at: 1, items: [] }) {
  const fetchMock = jest.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: 'x',
    json: async () => body,
  }));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function lastCall(fetchMock: ReturnType<typeof mockFetch>): [string, RequestInit] {
  return fetchMock.mock.calls.at(-1) as unknown as [string, RequestInit];
}

describe('recommendations api', () => {
  test('for-you passes the limit and the token', async () => {
    const fetchMock = mockFetch();
    await fetchRecommendations('tok', 5);
    const [url, init] = lastCall(fetchMock);
    expect(url).toMatch(/\/recommendations\?limit=5$/);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  test('nearby sends the position, a default radius and limit', async () => {
    const fetchMock = mockFetch();
    await fetchNearbyRecommendations('tok', { lat: 30.616, lon: -96.3393 });
    const [url] = lastCall(fetchMock);
    const query = new URL(url, 'http://x').searchParams;
    expect(query.get('lat')).toBe('30.616');
    expect(query.get('lon')).toBe('-96.3393');
    expect(query.get('radius_m')).toBe('2000');
    expect(query.get('limit')).toBe('20');
  });

  test('feedback posts the action and tolerates an empty 204', async () => {
    const fetchMock = mockFetch(204, null);
    await expect(sendFeedback('tok', 17, 'dismissed')).resolves.toBeUndefined();
    const [url, init] = lastCall(fetchMock);
    expect(url).toMatch(/\/recommendations\/17\/feedback$/);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ action: 'dismissed' });
  });

  test('next places omits at_ts unless asked', async () => {
    const fetchMock = mockFetch(200, { generated_at: 1, at_ts: 1, predictions: [] });
    await fetchNextPlaces('tok');
    expect(lastCall(fetchMock)[0]).toMatch(/\/predict\/next$/);
    await fetchNextPlaces('tok', 1_760_000_000_000);
    expect(lastCall(fetchMock)[0]).toMatch(/\/predict\/next\?at_ts=1760000000000$/);
  });

  test('a 503 from a model that is not installed rejects', async () => {
    mockFetch(503, { detail: 'app.ml.recommend is not installed yet' });
    await expect(fetchRecommendations('tok')).rejects.toThrow(/not installed/);
  });
});

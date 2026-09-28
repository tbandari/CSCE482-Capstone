import { ApiError } from '@/lib/api/client';
import { describeError } from '@/lib/describe-error';
import { fetchProfile, patchInterestHidden } from '@/lib/profile/api';
import { sampleProfile } from '@/lib/profile/sample-profile';

const profile = sampleProfile(1_760_000_000_000);

function mockFetch(status: number, body: unknown) {
  const fetchMock = jest.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: 'x',
    json: async () => body,
  }));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('profile api', () => {
  test('fetchProfile sends the bearer token and returns the profile', async () => {
    const fetchMock = mockFetch(200, profile);
    await expect(fetchProfile('tok-123')).resolves.toEqual(profile);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/profile$/);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-123');
  });

  test('patchInterestHidden PATCHes the escaped category with the flag', async () => {
    const fetchMock = mockFetch(200, profile);
    await patchInterestHidden('tok', 'fast_food', true);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/profile\/interests\/fast_food$/);
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toEqual({ hidden: true });
  });

  test('a failed request rejects with an ApiError the UI can describe', async () => {
    mockFetch(503, { detail: 'The interest model is not installed yet' });
    await expect(fetchProfile('tok')).rejects.toBeInstanceOf(ApiError);
  });
});

describe('describeError', () => {
  test('turns transport and status failures into readable lines', () => {
    expect(describeError(new ApiError('boom', null, true))).toMatch(/connection/i);
    expect(describeError(new ApiError('nope', 401, false))).toMatch(/sign in again/i);
    expect(describeError(new ApiError('nope', 503, false))).toMatch(/not ready/i);
    expect(describeError(new ApiError('Unknown category', 422, false))).toBe('Unknown category');
    expect(describeError(new Error('plain'))).toBe('plain');
    expect(describeError('string failure')).toBe('string failure');
  });
});

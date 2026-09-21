import { ApiError, apiFetch } from '@/lib/api/client';

describe('apiFetch', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('classifies a timeout as a network error', async () => {
    jest.useFakeTimers();
    jest.spyOn(globalThis, 'fetch').mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        }),
    );

    const assertion = expect(apiFetch('/health')).rejects.toMatchObject({
      name: 'ApiError',
      status: null,
      isNetworkError: true,
      message: 'The request timed out.',
    } satisfies Partial<ApiError>);
    await jest.advanceTimersByTimeAsync(15_000);
    await assertion;
  });
});

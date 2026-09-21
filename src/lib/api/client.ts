import { API_BASE_URL } from '@/lib/api/config';

const REQUEST_TIMEOUT_MS = 15_000;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly isNetworkError: boolean,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiFetchOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string | null;
  signal?: AbortSignal;
}

async function responseMessage(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { detail?: unknown; message?: unknown };
    if (typeof data.detail === 'string') return data.detail;
    if (typeof data.message === 'string') return data.message;
  } catch {
    // Some proxy and server errors are not JSON.
  }
  return response.statusText || `Request failed with status ${response.status}`;
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort();
  options.signal?.addEventListener('abort', abortFromCaller, { once: true });

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? (options.body == null ? 'GET' : 'POST'),
      headers: {
        Accept: 'application/json',
        ...(options.body == null ? {} : { 'Content-Type': 'application/json' }),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body == null ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new ApiError(await responseMessage(response), response.status, false);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const timedOut = controller.signal.aborted && !options.signal?.aborted;
    throw new ApiError(
      timedOut ? 'The request timed out.' : error instanceof Error ? error.message : 'Network request failed.',
      null,
      true,
    );
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abortFromCaller);
  }
}

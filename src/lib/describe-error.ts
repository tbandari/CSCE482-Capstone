import { ApiError } from '@/lib/api/client';

/** A message worth showing on screen: never "[object Object]", never a stack trace. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.isNetworkError) return 'Could not reach Orbit. Check your connection and try again.';
    if (error.status === 401) return 'Your session expired. Sign in again.';
    if (error.status === 503) return 'This is not ready on the server yet. Try again later.';
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

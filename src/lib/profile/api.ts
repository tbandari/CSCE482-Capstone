import { apiFetch } from '@/lib/api/client';
import type { InterestProfile } from '@/lib/profile/types';

export function fetchProfile(token: string, signal?: AbortSignal): Promise<InterestProfile> {
  return apiFetch<InterestProfile>('/profile', { token, signal });
}

/** Hides or shows a category server-side; the response is the whole updated profile. */
export function patchInterestHidden(token: string, category: string, hidden: boolean): Promise<InterestProfile> {
  return apiFetch<InterestProfile>(`/profile/interests/${encodeURIComponent(category)}`, {
    method: 'PATCH',
    token,
    body: { hidden },
  });
}

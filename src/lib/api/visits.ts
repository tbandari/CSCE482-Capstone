import { apiFetch } from '@/lib/api/client';
import type { Visit } from '@/lib/types';

interface ApiPlace {
  id: number;
  name: string | null;
  category: string;
}

interface ApiVisit {
  id: number;
  start_ts: number;
  end_ts: number;
  lat: number;
  lon: number;
  radius: number;
  point_count: number;
  label: string | null;
  place: ApiPlace | null;
  place_confidence: number | null;
}

export interface FetchVisitsOptions {
  from: number;
  limit: number;
}

export async function fetchVisits(
  { from, limit }: FetchVisitsOptions,
  token: string,
): Promise<Visit[]> {
  const query = new URLSearchParams({ from_ts: String(from), limit: String(limit) });
  const visits = await apiFetch<ApiVisit[]>(`/visits?${query}`, { token });
  return visits.map((visit) => ({
    id: visit.id,
    startTs: visit.start_ts,
    endTs: visit.end_ts,
    lat: visit.lat,
    lon: visit.lon,
    radius: visit.radius,
    pointCount: visit.point_count,
    label: visit.label,
    placeId: visit.place?.id ?? null,
    placeName: visit.place?.name ?? null,
    placeCategory: visit.place?.category ?? null,
    placeConfidence: visit.place_confidence,
  }));
}

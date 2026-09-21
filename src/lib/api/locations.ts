import { apiFetch } from '@/lib/api/client';
import type { LocationPoint } from '@/lib/types';

export interface IngestResponse {
  received: number;
  inserted: number;
  duplicates: number;
}

export function uploadPoints(points: readonly LocationPoint[], token: string): Promise<IngestResponse> {
  return apiFetch<IngestResponse>('/locations/batch', {
    method: 'POST',
    token,
    body: {
      points: points.map((point) => ({
        ts: point.ts,
        lat: point.lat,
        lon: point.lon,
        accuracy: point.accuracy,
        altitude: point.altitude,
        speed: point.speed,
        source: point.source,
        import_id: point.importId,
      })),
    },
  });
}

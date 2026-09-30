import { apiFetch } from '@/lib/api/client';

export interface JobStatus {
  id: string;
  kind: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  created_at: number;
  finished_at: number | null;
  result: unknown;
  error: string | null;
}

export function requestRecompute(token: string): Promise<{ job_id: string; status: string }> {
  return apiFetch('/visits/recompute', { method: 'POST', token });
}

export function fetchJob(jobId: string, token: string): Promise<JobStatus> {
  return apiFetch(`/jobs/${jobId}`, { token });
}

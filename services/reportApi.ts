import type { ReportRecord, ReportResult, ReportSections } from '../types';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

async function jsonRequest<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error || `Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function generateReports(urls: string[]): Promise<ReportResult[]> {
  const response = await jsonRequest<{ results: ReportResult[] }>(`${API_BASE}/api/reports/generate`, {
    method: 'POST',
    body: JSON.stringify({ urls }),
  });

  return response.results;
}

export async function updateReport(id: string, report: Partial<ReportSections>): Promise<ReportRecord> {
  const response = await jsonRequest<{ record: ReportRecord }>(`${API_BASE}/api/reports/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ report }),
  });

  return response.record;
}

export function exportPdf(id: string): string {
  return `${API_BASE}/api/reports/${id}/export/pdf`;
}

export function exportDocx(id: string): string {
  return `${API_BASE}/api/reports/${id}/export/docx`;
}

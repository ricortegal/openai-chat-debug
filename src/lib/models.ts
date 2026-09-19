import type { ModelInfo } from '../types';

interface ModelsResponse {
  models?: ModelInfo[];
  error?: { message?: string };
}

export async function fetchModels(baseUrl: string, apiKey: string, signal?: AbortSignal): Promise<ModelInfo[]> {
  const response = await fetch('/api/models', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseUrl, apiKey }),
    signal,
  });
  const body = await response.json() as ModelsResponse;
  if (!response.ok) throw new Error(body.error?.message ?? `No se pudieron listar los modelos (${response.status}).`);
  return body.models ?? [];
}

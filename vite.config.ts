import { defineConfig, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import type { IncomingMessage, ServerResponse } from 'node:http';

const MAX_BODY_BYTES = 2 * 1024 * 1024;

interface ChatProxyRequest {
  baseUrl: string;
  apiKey?: string;
  payload: Record<string, unknown>;
}

interface ModelsProxyRequest {
  baseUrl: string;
  apiKey?: string;
}

function readJson(req: IncomingMessage): Promise<ChatProxyRequest> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('La petición supera el límite de 2 MB.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as ChatProxyRequest);
      } catch {
        reject(new Error('El cuerpo de la petición no es JSON válido.'));
      }
    });
    req.on('error', reject);
  });
}

function normalizeEndpoint(baseUrl: string): URL {
  const url = new URL(baseUrl.trim());
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('La URL base debe usar http o https.');
  }
  url.pathname = `${url.pathname.replace(/\/$/, '')}/chat/completions`;
  return url;
}

function modelsEndpoint(baseUrl: string): URL {
  const url = new URL(baseUrl.trim());
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('La URL base debe usar http o https.');
  url.pathname = `${url.pathname.replace(/\/$/, '')}/models`;
  return url;
}

function nativeModelsEndpoint(baseUrl: string): URL {
  const base = new URL(baseUrl.trim());
  return new URL('/api/v1/models', base.origin);
}

async function fetchJson(url: URL, headers: Record<string, string>, timeoutMs = 8000): Promise<unknown> {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`${url.pathname}: HTTP ${response.status}`);
  return response.json();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function modelId(model: Record<string, unknown>): string {
  return String(model.id ?? model.key ?? model.model ?? '');
}

async function modelsProxy(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: { message: 'Método no permitido.' } }));
    return;
  }

  try {
    const { baseUrl, apiKey } = await readJson(req) as unknown as ModelsProxyRequest;
    if (!baseUrl) throw new Error('Falta la URL base.');
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (apiKey?.trim()) headers.Authorization = `Bearer ${apiKey.trim()}`;

    const standard = await fetchJson(modelsEndpoint(baseUrl), headers);
    const standardRecords = Array.isArray(asRecord(standard).data)
      ? (asRecord(standard).data as unknown[]).map(asRecord)
      : [];

    let nativeRecords: Record<string, unknown>[] = [];
    try {
      const native = await fetchJson(nativeModelsEndpoint(baseUrl), headers, 3000);
      nativeRecords = Array.isArray(asRecord(native).models)
        ? (asRecord(native).models as unknown[]).map(asRecord)
        : [];
    } catch {
      // The richer endpoint is LM Studio-specific; other compatible providers may not expose it.
    }

    const nativeById = new Map(nativeRecords.map((model) => [modelId(model), model]));
    const ids = new Set([...standardRecords.map(modelId), ...nativeRecords.map(modelId)].filter(Boolean));
    const models = [...ids].map((id) => {
      const compatible = standardRecords.find((model) => modelId(model) === id) ?? {};
      const native = nativeById.get(id) ?? {};
      const metadata = { ...compatible, ...native };
      return {
        id,
        name: String(native.display_name ?? compatible.name ?? id),
        metadata,
      };
    });

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ models }));
  } catch (error) {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: { message: error instanceof Error ? error.message : 'No se pudieron listar los modelos.' } }));
  }
}

async function chatProxy(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: { message: 'Método no permitido.' } }));
    return;
  }

  try {
    const { baseUrl, apiKey, payload } = await readJson(req);
    if (!baseUrl || !payload || typeof payload !== 'object') {
      throw new Error('Faltan la URL base o el contenido de la petición.');
    }

    const endpoint = normalizeEndpoint(baseUrl);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey?.trim()) headers.Authorization = `Bearer ${apiKey.trim()}`;

    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5 * 60 * 1000),
    });

    res.statusCode = upstream.status;
    res.statusMessage = upstream.statusText;
    res.setHeader(
      'Content-Type',
      upstream.headers.get('content-type') ?? 'application/json; charset=utf-8',
    );
    res.setHeader('Cache-Control', 'no-cache, no-transform');

    if (!upstream.body) {
      res.end();
      return;
    }

    const reader = upstream.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
    } finally {
      reader.releaseLock();
      res.end();
    }
  } catch (error) {
    if (res.headersSent) {
      res.end();
      return;
    }
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: { message: error instanceof Error ? error.message : 'Error del proxy.' } }));
  }
}

function openAiProxy(): Plugin {
  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    if (req.url === '/api/models') {
      void modelsProxy(req, res);
      return;
    }
    if (req.url !== '/api/chat') {
      next();
      return;
    }
    void chatProxy(req, res);
  };

  return {
    name: 'openai-compatible-proxy',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig({
  plugins: [react(), openAiProxy()],
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1', port: 4173 },
});

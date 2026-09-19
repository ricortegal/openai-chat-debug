import type { ChatMessage, ConnectionSettings, ProtocolExchange, ProtocolUpdate, StreamDelta } from '../types';

interface SendChatOptions {
  settings: ConnectionSettings;
  messages: ChatMessage[];
  signal: AbortSignal;
  onDelta: (text: string) => void;
  onProtocol: (update: ProtocolUpdate) => void;
}

function cleanMessages(messages: ChatMessage[], systemPrompt: string) {
  const chatMessages = messages
    .filter((message) => message.role !== 'system' && !message.localOnly)
    .map(({ role, content }) => ({ role, content }));

  return systemPrompt.trim()
    ? [{ role: 'system' as const, content: systemPrompt.trim() }, ...chatMessages]
    : chatMessages;
}

function getErrorMessage(body: unknown, status: number): string {
  if (body && typeof body === 'object' && 'error' in body) {
    const error = (body as { error?: { message?: string } | string }).error;
    if (typeof error === 'string') return error;
    if (error?.message) return error.message;
  }
  return `El proveedor respondió con un error HTTP ${status}.`;
}

function parseSseBlock(block: string): string {
  const dataLines = block
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart());

  if (!dataLines.length) return '';
  const raw = dataLines.join('\n').trim();
  if (!raw || raw === '[DONE]') return '';

  const event = JSON.parse(raw) as StreamDelta;
  if (event.error?.message) throw new Error(event.error.message);
  return event.choices?.[0]?.delta?.content ?? '';
}

async function consumeStream(
  response: Response,
  onDelta: (text: string) => void,
  onChunk: (chunk: string) => void,
): Promise<string> {
  if (!response.body) throw new Error('El proveedor no devolvió un flujo de datos.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let complete = '';

  while (true) {
    const { done, value } = await reader.read();
    const decoded = decoder.decode(value, { stream: !done });
    if (decoded) onChunk(decoded);
    buffer += decoded.replace(/\r\n/g, '\n');
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() ?? '';

    for (const block of blocks) {
      const delta = parseSseBlock(block);
      if (delta) {
        complete += delta;
        onDelta(complete);
      }
    }
    if (done) break;
  }

  if (buffer.trim()) {
    const delta = parseSseBlock(buffer);
    complete += delta;
    if (delta) onDelta(complete);
  }
  return complete;
}

export async function sendChat({ settings, messages, signal, onDelta, onProtocol }: SendChatOptions): Promise<string> {
  const payload = {
    model: settings.model.trim(),
    messages: cleanMessages(messages, settings.systemPrompt),
    temperature: settings.temperature,
    max_tokens: settings.maxTokens,
    stream: settings.stream,
  };

  const exchangeId = crypto.randomUUID();
  const exchange: ProtocolExchange = {
    id: exchangeId,
    startedAt: Date.now(),
    request: {
      method: 'POST',
      endpoint: `${settings.baseUrl.replace(/\/$/, '')}/chat/completions`,
      headers: {
        'Content-Type': 'application/json',
        ...(settings.apiKey.trim() ? { Authorization: 'Bearer ••••••••' } : {}),
      },
      body: payload,
    },
    rawResponse: '',
  };
  onProtocol({ type: 'request', exchange });

  let response: Response;
  try {
    response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl: settings.baseUrl, apiKey: settings.apiKey, payload }),
      signal,
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Error de red.';
    onProtocol({ type: 'error', id: exchangeId, error: message });
    throw cause;
  }

  onProtocol({
    type: 'response',
    id: exchangeId,
    response: {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
    },
  });

  if (!response.ok) {
    const raw = await response.text();
    onProtocol({ type: 'chunk', id: exchangeId, chunk: raw });
    const body: unknown = (() => { try { return JSON.parse(raw); } catch { return null; } })();
    throw new Error(getErrorMessage(body, response.status));
  }

  if (settings.stream) {
    return consumeStream(response, onDelta, (chunk) => onProtocol({ type: 'chunk', id: exchangeId, chunk }));
  }

  const raw = await response.text();
  onProtocol({ type: 'chunk', id: exchangeId, chunk: raw });
  const body = JSON.parse(raw) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('La respuesta no contiene un mensaje de asistente válido.');
  onDelta(content);
  return content;
}

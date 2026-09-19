import type { ChatMessage, ChatResponse, ConnectionSettings, ProtocolExchange, ProtocolUpdate, StreamDelta } from '../types';

interface SendChatOptions {
  settings: ConnectionSettings;
  messages: ChatMessage[];
  signal: AbortSignal;
  onDelta: (response: ChatResponse) => void;
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

function reasoningDetailsToText(details: unknown): string {
  if (typeof details === 'string') return details;
  if (!Array.isArray(details)) return '';

  return details.flatMap((detail) => {
    if (typeof detail === 'string') return [detail];
    if (!detail || typeof detail !== 'object') return [];
    const item = detail as { text?: unknown; content?: unknown; summary?: unknown };
    for (const value of [item.text, item.content, item.summary]) {
      if (typeof value === 'string') return [value];
    }
    return [];
  }).join('\n');
}

function getReasoningPart(value: {
  reasoning_content?: unknown;
  reasoning?: unknown;
  thinking?: unknown;
  reasoning_details?: unknown;
} | undefined): string {
  if (!value) return '';
  for (const candidate of [value.reasoning_content, value.reasoning, value.thinking]) {
    if (typeof candidate === 'string') return candidate;
  }
  return reasoningDetailsToText(value.reasoning_details);
}

function extractTaggedReasoning(rawContent: string): ChatResponse {
  const reasoning: string[] = [];
  const tagPattern = /<(think|thinking|reasoning)>\s*([\s\S]*?)\s*<\/\1>/gi;
  let content = rawContent.replace(tagPattern, (_match, _tag: string, value: string) => {
    if (value.trim()) reasoning.push(value.trim());
    return '';
  });

  // Durante el streaming puede existir una etiqueta de apertura aún sin cerrar.
  const openTag = /<(think|thinking|reasoning)>/i.exec(content);
  if (openTag) {
    const pending = content.slice(openTag.index + openTag[0].length).trim();
    if (pending) reasoning.push(pending);
    content = content.slice(0, openTag.index);
  }

  return { content: content.trimStart(), reasoning: reasoning.join('\n\n') };
}

function combineResponse(rawContent: string, structuredReasoning: string): ChatResponse {
  const tagged = extractTaggedReasoning(rawContent);
  const parts = [structuredReasoning.trim(), tagged.reasoning.trim()].filter(Boolean);
  const reasoning = parts.length === 2 && parts[0] === parts[1] ? parts[0] : parts.join('\n\n');
  return { content: tagged.content, reasoning };
}

function parseSseBlock(block: string): ChatResponse {
  const dataLines = block
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart());

  if (!dataLines.length) return { content: '', reasoning: '' };
  const raw = dataLines.join('\n').trim();
  if (!raw || raw === '[DONE]') return { content: '', reasoning: '' };

  const event = JSON.parse(raw) as StreamDelta;
  if (event.error?.message) throw new Error(event.error.message);
  const delta = event.choices?.[0]?.delta;
  return {
    content: typeof delta?.content === 'string' ? delta.content : '',
    reasoning: getReasoningPart(delta),
  };
}

async function consumeStream(
  response: Response,
  onDelta: (response: ChatResponse) => void,
  onChunk: (chunk: string) => void,
): Promise<ChatResponse> {
  if (!response.body) throw new Error('El proveedor no devolvió un flujo de datos.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let completeContent = '';
  let completeReasoning = '';

  while (true) {
    const { done, value } = await reader.read();
    const decoded = decoder.decode(value, { stream: !done });
    if (decoded) onChunk(decoded);
    buffer += decoded.replace(/\r\n/g, '\n');
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() ?? '';

    for (const block of blocks) {
      const delta = parseSseBlock(block);
      if (delta.content || delta.reasoning) {
        completeContent += delta.content;
        completeReasoning += delta.reasoning;
        onDelta(combineResponse(completeContent, completeReasoning));
      }
    }
    if (done) break;
  }

  if (buffer.trim()) {
    const delta = parseSseBlock(buffer);
    completeContent += delta.content;
    completeReasoning += delta.reasoning;
    if (delta.content || delta.reasoning) onDelta(combineResponse(completeContent, completeReasoning));
  }
  return combineResponse(completeContent, completeReasoning);
}

export async function sendChat({ settings, messages, signal, onDelta, onProtocol }: SendChatOptions): Promise<ChatResponse> {
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
    choices?: Array<{ message?: {
      content?: string;
      reasoning_content?: string;
      reasoning?: string;
      thinking?: string;
      reasoning_details?: unknown;
    } }>;
  };
  const message = body.choices?.[0]?.message;
  const content = message?.content;
  if (typeof content !== 'string') throw new Error('La respuesta no contiene un mensaje de asistente válido.');
  const complete = combineResponse(content, getReasoningPart(message));
  onDelta(complete);
  return complete;
}

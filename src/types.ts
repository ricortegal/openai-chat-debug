export type Role = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  reasoning?: string;
  createdAt: number;
  latencyMs?: number;
  localOnly?: boolean;
}

export interface ConnectionSettings {
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  stream: boolean;
}

export interface StreamDelta {
  choices?: Array<{
    delta?: {
      content?: string;
      reasoning_content?: string;
      reasoning?: string;
      thinking?: string;
      reasoning_details?: unknown;
    };
    finish_reason?: string | null;
  }>;
  error?: { message?: string };
}

export interface ChatResponse {
  content: string;
  reasoning: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  metadata: Record<string, unknown>;
}

export interface ProtocolExchange {
  id: string;
  startedAt: number;
  request: {
    method: string;
    endpoint: string;
    headers: Record<string, string>;
    body: Record<string, unknown>;
  };
  response?: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
  };
  rawResponse: string;
  error?: string;
}

export type ProtocolUpdate =
  | { type: 'request'; exchange: ProtocolExchange }
  | { type: 'response'; id: string; response: NonNullable<ProtocolExchange['response']> }
  | { type: 'chunk'; id: string; chunk: string }
  | { type: 'error'; id: string; error: string };

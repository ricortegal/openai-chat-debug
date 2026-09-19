import type { ConnectionSettings } from '../types';

const STORAGE_KEY = 'model-lab-settings';

export const DEFAULT_SETTINGS: ConnectionSettings = {
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  systemPrompt: 'Eres un asistente útil, preciso y conciso.',
  temperature: 0.7,
  maxTokens: 1024,
  stream: true,
};

export function loadSettings(): ConnectionSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<ConnectionSettings>;
    return { ...DEFAULT_SETTINGS, ...saved, apiKey: '' };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: ConnectionSettings): void {
  const { apiKey: _secret, ...safeSettings } = settings;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(safeSettings));
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { Composer } from './components/Composer';
import { MessageBubble } from './components/MessageBubble';
import { SettingsPanel } from './components/SettingsPanel';
import { ProtocolPanel } from './components/ProtocolPanel';
import { SettingsIcon, SparkIcon, TrashIcon } from './components/Icons';
import { sendChat } from './lib/chat';
import { fetchModels } from './lib/models';
import { loadSettings, saveSettings } from './lib/storage';
import type { ChatMessage, ConnectionSettings, ModelInfo, ProtocolExchange, ProtocolUpdate } from './types';

const id = () => crypto.randomUUID();

export default function App() {
  const [settings, setSettings] = useState<ConnectionSettings>(loadSettings);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [protocolOpen, setProtocolOpen] = useState(false);
  const [protocolExchanges, setProtocolExchanges] = useState<ProtocolExchange[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const refreshModels = useCallback(async (signal?: AbortSignal) => {
    if (!settings.baseUrl.trim()) return [];
    setModelsLoading(true);
    setModelsError('');
    try {
      const available = await fetchModels(settings.baseUrl, settings.apiKey, signal);
      setModels(available);
      return available;
    } catch (cause) {
      if (signal?.aborted) return [];
      const message = cause instanceof Error ? cause.message : 'No se pudieron listar los modelos.';
      setModelsError(message);
      return [];
    } finally {
      if (!signal?.aborted) setModelsLoading(false);
    }
  }, [settings.baseUrl, settings.apiKey]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => { void refreshModels(controller.signal); }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [refreshModels]);

  const updateProtocol = useCallback((update: ProtocolUpdate) => {
    setProtocolExchanges((current) => {
      if (update.type === 'request') return [...current.slice(-9), update.exchange];
      return current.map((exchange) => {
        if (exchange.id !== update.id) return exchange;
        if (update.type === 'response') return { ...exchange, response: update.response };
        if (update.type === 'error') return { ...exchange, error: update.error };
        return { ...exchange, rawResponse: `${exchange.rawResponse}${update.chunk}`.slice(-500_000) };
      });
    });
  }, []);

  const send = async () => {
    const content = draft.trim();
    if (!content || loading) return;
    if (content.toLowerCase() === '/list') {
      const userMessage: ChatMessage = { id: id(), role: 'user', content, createdAt: Date.now(), localOnly: true };
      setDraft('');
      setError('');
      setLoading(true);
      setMessages((current) => [...current, userMessage]);
      const available = await refreshModels();
      const list = available.length
        ? `He encontrado **${available.length} modelos**:\n\n${available.map((model) => `- \`${model.id}\`${model.name !== model.id ? ` — ${model.name}` : ''}`).join('\n')}\n\nPuedes seleccionarlos en el panel de configuración.`
        : 'No se pudo obtener ningún modelo. Revisa la URL del proveedor y el panel de configuración.';
      setMessages((current) => [...current, { id: id(), role: 'assistant', content: list, createdAt: Date.now(), localOnly: true }]);
      setLoading(false);
      setSettingsOpen(true);
      return;
    }
    if (!settings.baseUrl.trim() || !settings.model.trim()) {
      setError('Configura una URL base y un modelo antes de enviar.');
      setSettingsOpen(true);
      return;
    }

    const userMessage: ChatMessage = { id: id(), role: 'user', content, createdAt: Date.now() };
    const assistantId = id();
    const assistantMessage: ChatMessage = { id: assistantId, role: 'assistant', content: '', createdAt: Date.now() };
    const history = [...messages, userMessage];
    const controller = new AbortController();
    const startedAt = performance.now();

    setDraft('');
    setError('');
    setLoading(true);
    setMessages([...history, assistantMessage]);
    abortRef.current = controller;

    try {
      const complete = await sendChat({
        settings,
        messages: history,
        signal: controller.signal,
        onDelta: (response) => setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, ...response } : message)),
        onProtocol: updateProtocol,
      });
      setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, ...complete, latencyMs: performance.now() - startedAt } : message));
    } catch (cause) {
      if (controller.signal.aborted) {
        setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, latencyMs: performance.now() - startedAt } : message));
      } else {
        setMessages((current) => current.filter((message) => message.id !== assistantId));
        setError(cause instanceof Error ? cause.message : 'No se pudo completar la petición.');
      }
    } finally {
      abortRef.current = null;
      setLoading(false);
    }
  };

  const clear = () => {
    abortRef.current?.abort();
    setMessages([]);
    setError('');
  };

  return (
    <div className="app-shell">
      {settingsOpen && <SettingsPanel settings={settings} onChange={setSettings} onClose={() => setSettingsOpen(false)} models={models} modelsLoading={modelsLoading} modelsError={modelsError} onRefreshModels={() => { void refreshModels(); }} />}
      <main className="chat-area">
        <header className="topbar">
          <div className="topbar-left">
            <button className={`icon-button settings-toggle ${settingsOpen ? 'active' : ''}`} onClick={() => setSettingsOpen((open) => !open)} aria-label="Mostrar u ocultar configuración"><SettingsIcon /></button>
            <div className="mobile-brand"><span className="brand-mark"><SparkIcon size={18} /></span><strong>Model Lab</strong></div>
            <div className="model-status"><span className="status-dot" /><div><strong>{settings.model || 'Sin modelo'}</strong><small>{settings.baseUrl || 'Sin proveedor'}</small></div></div>
          </div>
          <div className="top-actions">
            {messages.length > 0 && <button className="text-button" onClick={clear}><TrashIcon /> Limpiar</button>}
            <button className={`protocol-toggle ${protocolOpen ? 'active' : ''}`} onClick={() => setProtocolOpen((open) => !open)} aria-label="Abrir inspector de protocolo"><code>{'{ }'}</code><span>Protocolo</span></button>
          </div>
        </header>

        <div className="conversation">
          {messages.length === 0 ? (
            <div className="empty-state">
              <div className="empty-glyph"><SparkIcon size={32} /></div>
              <p className="eyebrow">PLAYGROUND LOCAL</p>
              <h1>Prueba cualquier modelo.<br /><em>Conversa sin fricción.</em></h1>
              <p>Conecta un endpoint compatible con OpenAI, ajusta sus parámetros y observa la respuesta en tiempo real.</p>
              <div className="quick-prompts">
                {['Explícame un concepto complejo', 'Escribe una función en TypeScript', 'Resume un texto'].map((prompt) => (
                  <button key={prompt} onClick={() => setDraft(prompt)}>{prompt}<span>↗</span></button>
                ))}
              </div>
            </div>
          ) : (
            <div className="messages-list">
              {messages.map((message, index) => <MessageBubble key={message.id} message={message} isStreaming={loading && index === messages.length - 1} />)}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {error && <div className="error-banner" role="alert"><strong>Error</strong><span>{error}</span><button onClick={() => setError('')}>×</button></div>}
        <Composer value={draft} loading={loading} disabled={!settings.baseUrl.trim()} onChange={setDraft} onSend={send} onStop={() => abortRef.current?.abort()} />
      </main>
      {protocolOpen && <ProtocolPanel exchanges={protocolExchanges} onClose={() => setProtocolOpen(false)} onClear={() => setProtocolExchanges([])} />}
    </div>
  );
}

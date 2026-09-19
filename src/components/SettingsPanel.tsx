import type { ConnectionSettings, ModelInfo } from '../types';
import { SettingsIcon, SparkIcon } from './Icons';

interface SettingsPanelProps {
  settings: ConnectionSettings;
  onChange: (settings: ConnectionSettings) => void;
  onClose: () => void;
  models: ModelInfo[];
  modelsLoading: boolean;
  modelsError: string;
  onRefreshModels: () => void;
}

function humanBytes(value: unknown): string | undefined {
  if (typeof value !== 'number') return undefined;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit += 1; }
  return `${size.toFixed(unit > 2 ? 1 : 0)} ${units[unit]}`;
}

export function SettingsPanel({ settings, onChange, onClose, models, modelsLoading, modelsError, onRefreshModels }: SettingsPanelProps) {
  const patch = <K extends keyof ConnectionSettings>(key: K, value: ConnectionSettings[K]) => {
    onChange({ ...settings, [key]: value });
  };
  const selected = models.find((model) => model.id === settings.model);
  const meta = selected?.metadata ?? {};
  const capabilities = meta.capabilities && typeof meta.capabilities === 'object'
    ? meta.capabilities as Record<string, unknown>
    : {};

  return (
    <aside className="settings-panel">
      <div className="settings-heading">
        <div className="brand-mark"><SparkIcon size={18} /></div>
        <div><strong>Configuración</strong><span>Conexión y parámetros</span></div>
        <button className="icon-button close-settings" onClick={onClose} aria-label="Cerrar configuración">×</button>
      </div>

      <div className="settings-content">
        <section>
          <div className="section-label"><span>01</span> Proveedor</div>
          <label>URL base
            <input value={settings.baseUrl} onChange={(event) => patch('baseUrl', event.target.value)} placeholder="https://api.openai.com/v1" />
          </label>
          <label>Clave API
            <input type="password" value={settings.apiKey} onChange={(event) => patch('apiKey', event.target.value)} placeholder="sk-… (opcional en local)" autoComplete="off" />
          </label>
          <p className="field-note">La clave vive solo en la memoria de esta pestaña.</p>
          <div className="model-label-row"><span>Modelo</span><button onClick={onRefreshModels} disabled={modelsLoading}>{modelsLoading ? 'Consultando…' : '↻ /list'}</button></div>
          {models.length > 0 ? (
            <select value={settings.model} onChange={(event) => patch('model', event.target.value)}>
              {!models.some((model) => model.id === settings.model) && <option value={settings.model}>{settings.model}</option>}
              {models.map((model) => <option key={model.id} value={model.id} disabled={model.metadata.type === 'embedding'}>{model.name}{model.metadata.type === 'embedding' ? ' (embeddings)' : ''}</option>)}
            </select>
          ) : (
            <input className="model-fallback" value={settings.model} onChange={(event) => patch('model', event.target.value)} placeholder="gpt-4o-mini" />
          )}
          {modelsError && <p className="models-error">{modelsError}</p>}
          {selected && <div className="model-card">
            <strong>{selected.name}</strong>
            <code>{selected.id}</code>
            <div className="capability-tags">
              {meta.type != null && <span>{String(meta.type)}</span>}
              {meta.architecture != null && <span>{String(meta.architecture)}</span>}
              {meta.format != null && <span>{String(meta.format)}</span>}
              {capabilities.vision === true && <span>visión</span>}
              {capabilities.trained_for_tool_use === true && <span>tools</span>}
            </div>
            <dl>
              {meta.params_string != null && <><dt>Parámetros</dt><dd>{String(meta.params_string)}</dd></>}
              {meta.quantization != null && <><dt>Cuantización</dt><dd>{typeof meta.quantization === 'object' ? String((meta.quantization as Record<string, unknown>).name ?? '—') : String(meta.quantization)}</dd></>}
              {meta.max_context_length != null && <><dt>Contexto máx.</dt><dd>{Number(meta.max_context_length).toLocaleString('es')} tokens</dd></>}
              {meta.size_bytes != null && <><dt>Tamaño</dt><dd>{humanBytes(meta.size_bytes)}</dd></>}
              {Array.isArray(meta.loaded_instances) && <><dt>Instancias</dt><dd>{meta.loaded_instances.length}</dd></>}
            </dl>
            <details><summary>Todos los metadatos</summary><pre>{JSON.stringify(meta, null, 2)}</pre></details>
          </div>}
        </section>

        <section>
          <div className="section-label"><span>02</span> Comportamiento</div>
          <label>Instrucción de sistema
            <textarea rows={5} value={settings.systemPrompt} onChange={(event) => patch('systemPrompt', event.target.value)} />
          </label>
          <label className="range-label"><span>Temperatura <output>{settings.temperature.toFixed(1)}</output></span>
            <input type="range" min="0" max="2" step="0.1" value={settings.temperature} onChange={(event) => patch('temperature', Number(event.target.value))} />
          </label>
          <label>Máximo de tokens
            <input type="number" min="1" max="131072" value={settings.maxTokens} onChange={(event) => patch('maxTokens', Number(event.target.value))} />
          </label>
          <label className="toggle-row">
            <span><strong>Streaming</strong><small>Ver la respuesta mientras se genera</small></span>
            <input type="checkbox" checked={settings.stream} onChange={(event) => patch('stream', event.target.checked)} />
          </label>
        </section>
      </div>

      <div className="settings-footer"><SettingsIcon size={15} /> Los ajustes se guardan automáticamente</div>
    </aside>
  );
}

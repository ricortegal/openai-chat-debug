import { useState } from 'react';
import type { ProtocolExchange } from '../types';

interface ProtocolPanelProps {
  exchanges: ProtocolExchange[];
  onClose: () => void;
  onClear: () => void;
}

function JsonBlock({ value }: { value: unknown }) {
  return <pre className="protocol-code">{JSON.stringify(value, null, 2)}</pre>;
}

export function ProtocolPanel({ exchanges, onClose, onClear }: ProtocolPanelProps) {
  const [selectedId, setSelectedId] = useState<string>();
  const selected = exchanges.find((exchange) => exchange.id === selectedId) ?? exchanges.at(-1);

  return (
    <aside className="protocol-panel">
      <header className="protocol-heading">
        <div><strong>Protocolo</strong><span>Tráfico HTTP / SSE en crudo</span></div>
        <div>
          {exchanges.length > 0 && <button onClick={onClear}>Vaciar</button>}
          <button className="protocol-close" onClick={onClose} aria-label="Cerrar inspector">×</button>
        </div>
      </header>

      {exchanges.length === 0 ? (
        <div className="protocol-empty"><code>{'{ }'}</code><p>Envía un mensaje para inspeccionar la petición y la respuesta.</p></div>
      ) : (
        <>
          <nav className="exchange-tabs" aria-label="Intercambios">
            {exchanges.map((exchange, index) => (
              <button
                key={exchange.id}
                className={selected?.id === exchange.id ? 'active' : ''}
                onClick={() => setSelectedId(exchange.id)}
              >
                <span className={exchange.error ? 'trace-dot error' : exchange.response ? 'trace-dot ok' : 'trace-dot'} />
                #{index + 1} {new Date(exchange.startedAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </button>
            ))}
          </nav>

          {selected && <div className="protocol-content">
            <section>
              <h3><span>→</span> Petición</h3>
              <div className="request-line"><b>{selected.request.method}</b> {selected.request.endpoint}</div>
              <details><summary>Cabeceras</summary><JsonBlock value={selected.request.headers} /></details>
              <h4>Body</h4>
              <JsonBlock value={selected.request.body} />
            </section>
            <section>
              <h3><span>←</span> Respuesta</h3>
              {selected.response
                ? <><div className={`response-status ${selected.response.status >= 400 ? 'bad' : ''}`}><b>{selected.response.status}</b> {selected.response.statusText}</div><details><summary>Cabeceras</summary><JsonBlock value={selected.response.headers} /></details></>
                : <p className="protocol-waiting">Esperando cabeceras…</p>}
              {selected.error && <div className="protocol-error">{selected.error}</div>}
              <h4>Respuesta cruda</h4>
              <pre className="protocol-code raw">{selected.rawResponse || 'Esperando datos…'}</pre>
            </section>
          </div>}
        </>
      )}
    </aside>
  );
}

import { useState } from 'react';
import type { ChatMessage } from '../types';
import { CopyIcon, SparkIcon } from './Icons';
import { MarkdownContent } from './MarkdownContent';

interface MessageBubbleProps { message: ChatMessage; isStreaming?: boolean }

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' }).format(timestamp);
}

export function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const isAssistant = message.role === 'assistant';

  const copy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <article className={`message ${message.role}`}>
      <div className="message-avatar">{isAssistant ? <SparkIcon size={18} /> : 'TÚ'}</div>
      <div className="message-body">
        <div className="message-meta">
          <strong>{isAssistant ? 'Modelo' : 'Tú'}</strong>
          <span>{formatTime(message.createdAt)}</span>
          {message.latencyMs !== undefined && <span>· {(message.latencyMs / 1000).toFixed(1)} s</span>}
        </div>
        {isAssistant && message.reasoning && (
          <details className="reasoning-block" open={isStreaming}>
            <summary>
              <span className="reasoning-chevron" aria-hidden="true">›</span>
              <strong>Razonamiento</strong>
              <span className="reasoning-status">
                {isStreaming ? 'generando…' : <><span className="reasoning-show">mostrar</span><span className="reasoning-hide">ocultar</span></>}
              </span>
            </summary>
            <div className="reasoning-content">
              <MarkdownContent content={message.reasoning} />
            </div>
          </details>
        )}
        <div className="message-content">
          {message.content
            ? (isAssistant ? <MarkdownContent content={message.content} /> : message.content)
            : (isStreaming && !message.reasoning ? <span className="typing"><i /><i /><i /></span> : '')}
          {isStreaming && message.content && <span className="cursor" />}
        </div>
        {isAssistant && message.content && !isStreaming && (
          <button className="copy-button" onClick={copy}><CopyIcon /> {copied ? 'Copiado' : 'Copiar'}</button>
        )}
      </div>
    </article>
  );
}

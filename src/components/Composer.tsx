import { useRef, type KeyboardEvent } from 'react';
import { SendIcon } from './Icons';

interface ComposerProps {
  value: string;
  loading: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
}

export function Composer({ value, loading, disabled, onChange, onSend, onStop }: ComposerProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (!disabled && value.trim()) onSend();
    }
  };

  return (
    <div className="composer-wrap">
      <div className="composer">
        <textarea
          ref={inputRef}
          rows={1}
          value={value}
          disabled={loading}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={keyDown}
          placeholder={loading ? 'Esperando la respuesta…' : 'Escribe un mensaje…'}
          aria-label="Mensaje"
        />
        {loading ? (
          <button className="stop-button" onClick={onStop} aria-label="Detener generación"><span /></button>
        ) : (
          <button className="send-button" onClick={onSend} disabled={disabled || !value.trim()} aria-label="Enviar mensaje"><SendIcon /></button>
        )}
      </div>
      <p><kbd>Enter</kbd> para enviar · <kbd>Shift + Enter</kbd> para nueva línea</p>
    </div>
  );
}

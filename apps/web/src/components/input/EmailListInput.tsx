import * as React from 'react';

interface EmailListInputProps {
  placeholder?: string;
  onAdd: (email: string) => void;
}

/**
 * EmailListInput - A specialized input component for entering email addresses
 * Supports comma-separated values and validates email format
 */
export function EmailListInput({ placeholder, onAdd }: EmailListInputProps) {
  const [text, setText] = React.useState('');
  const [localErr, setLocalErr] = React.useState<string | null>(null);
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function tryAdd(candidate: string) {
    const trimmed = candidate.trim();
    if (!trimmed) return;
    if (!emailRegex.test(trimmed)) {
      setLocalErr('Invalid email');
      return;
    }
    onAdd(trimmed);
    setText('');
    setLocalErr(null);
  }

  return (
    <div>
      <input
        className="border rounded px-2 py-1"
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            tryAdd(text);
          }
        }}
        onBlur={() => {
          if (text.includes(',')) {
            text.split(',').forEach((t) => tryAdd(t));
          } else {
            tryAdd(text);
          }
        }}
      />
      {localErr && <div className="text-sm text-destructive mt-1">{localErr}</div>}
    </div>
  );
}

export default EmailListInput;

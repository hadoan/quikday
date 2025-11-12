import * as React from 'react';

type InputType = 'text' | 'email' | 'number' | 'date' | 'time' | 'datetime-local';

interface TextInputProps {
  type?: InputType;
  value: string | number;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  rows?: number;
  onChange: (value: string | number) => void;
}

/**
 * TextInput - A versatile input component for text, email, number, date, time, and datetime
 * Also supports textarea via rows prop
 */
export function TextInput({
  type = 'text',
  value,
  placeholder,
  required = false,
  disabled = false,
  rows,
  onChange,
}: TextInputProps) {
  const className =
    'border rounded px-2 py-1 disabled:bg-muted disabled:cursor-not-allowed disabled:opacity-75';

  // Handle number input separately to preserve numeric type
  if (type === 'number') {
    return (
      <input
        type="number"
        step={1}
        className={className}
        value={typeof value === 'number' ? value : String(value)}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        disabled={disabled}
        readOnly={disabled}
        aria-required={required}
      />
    );
  }

  // Textarea for multi-line text
  if (rows && rows > 1) {
    return (
      <textarea
        rows={rows}
        className={className}
        placeholder={placeholder}
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        readOnly={disabled}
        aria-required={required}
      />
    );
  }

  // Standard input for text, email, date, time, datetime-local
  return (
    <input
      type={type}
      className={className}
      placeholder={placeholder}
      value={String(value)}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      readOnly={disabled}
      aria-required={required}
    />
  );
}

import * as React from 'react';

interface SelectInputProps {
  value: string;
  options: string[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
}

/**
 * SelectInput - A dropdown select component with options
 */
export function SelectInput({
  value,
  options,
  placeholder,
  required = false,
  disabled = false,
  onChange,
}: SelectInputProps) {
  if (options.length === 0) {
    // Fallback to text input if no options provided
    return (
      <input
        type="text"
        className="border rounded px-2 py-1 disabled:bg-muted disabled:cursor-not-allowed disabled:opacity-75"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        readOnly={disabled}
        aria-required={required}
      />
    );
  }

  return (
    <select
      className="border rounded px-2 py-1 disabled:bg-muted disabled:cursor-not-allowed disabled:opacity-75"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      aria-required={required}
    >
      <option value="" disabled>
        {required ? 'Select… (required)' : 'Select…'}
      </option>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}

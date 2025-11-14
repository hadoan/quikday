import * as React from 'react';

interface MultiselectInputProps {
  value: string[];
  options: string[];
  required?: boolean;
  disabled?: boolean;
  onChange: (value: string[]) => void;
}

/**
 * MultiselectInput - A checkbox-based multi-select component
 */
export function MultiselectInput({
  value,
  options,
  required = false,
  disabled = false,
  onChange,
}: MultiselectInputProps) {
  const handleToggle = (option: string, checked: boolean) => {
    const current = [...value];
    if (checked) {
      current.push(option);
    } else {
      const idx = current.indexOf(option);
      if (idx >= 0) {
        current.splice(idx, 1);
      }
    }
    onChange(current);
  };

  return (
    <div className="flex flex-col gap-1">
      {options.map((opt) => (
        <label key={opt} className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={value.includes(opt)}
            onChange={(e) => handleToggle(opt, e.target.checked)}
            disabled={disabled}
            aria-required={required}
          />
          <span>{opt}</span>
        </label>
      ))}
    </div>
  );
}

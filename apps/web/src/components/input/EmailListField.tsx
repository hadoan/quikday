import * as React from 'react';
import { EmailListInput } from './EmailListInput';

interface EmailListFieldProps {
  value: string[];
  placeholder?: string;
  disabled?: boolean;
  onChange: (value: string[]) => void;
}

/**
 * EmailListField - Complete email list component with chips and input
 * Displays existing emails as removable chips and provides input for new emails
 */
export function EmailListField({
  value,
  placeholder,
  disabled = false,
  onChange,
}: EmailListFieldProps) {
  const handleRemove = (email: string) => {
    onChange(value.filter((e) => e !== email));
  };

  const handleAdd = (email: string) => {
    onChange([...value, email]);
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-1">
        {value.map((email, idx) => (
          <span
            key={`email-chip-${idx}`}
            className="px-2 py-0.5 bg-gray-200 rounded flex items-center gap-2"
          >
            <span className="text-sm">{email}</span>
            {!disabled && (
              <button
                type="button"
                aria-label={`Remove ${email}`}
                onClick={() => handleRemove(email)}
              >
                ×
              </button>
            )}
          </span>
        ))}
      </div>
      {!disabled && <EmailListInput placeholder={placeholder} onAdd={handleAdd} />}
    </div>
  );
}

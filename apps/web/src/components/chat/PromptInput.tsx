import { useEffect, useState } from 'react';
import { Send, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('PromptInput');

interface PromptInputProps {
  onSubmit: (prompt: string) => void;
  disabled?: boolean;
  placeholder?: string;
  initialValue?: string;
}

export const PromptInput = ({
  onSubmit,
  disabled = false,
  placeholder = "Type your intent... (e.g., 'Schedule a check-in with Sara tomorrow at 10')",
  initialValue,
}: PromptInputProps) => {
  const [prompt, setPrompt] = useState(initialValue || '');

  useEffect(() => {
    if (typeof initialValue === 'string') {
      // Only set prefill when no text yet, to avoid clobbering user typing
      setPrompt((cur) => (cur ? cur : initialValue));
    }
  }, [initialValue]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim() && !disabled) {
      logger.info('🚀 Send button pressed', {
        timestamp: new Date().toISOString(),
        prompt: prompt.substring(0, 50) + (prompt.length > 50 ? '...' : ''),
        promptLength: prompt.length,
      });
      onSubmit(prompt);
      setPrompt('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="relative flex items-end gap-3 p-4 bg-card border border-border rounded-xl shadow-sm">
        <div className="flex-1">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            className={cn(
              'min-h-[60px] resize-none border-0 bg-transparent p-0 focus-visible:ring-0 focus-visible:ring-offset-0',
              'placeholder:text-muted-foreground',
            )}
            rows={1}
          />
        </div>
        <Button
          type="submit"
          size="icon"
          disabled={!prompt.trim() || disabled}
          className="h-10 w-10 shrink-0"
        >
          {disabled ? (
            <Sparkles className="h-5 w-5 animate-pulse-glow" />
          ) : (
            <Send className="h-5 w-5" />
          )}
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground text-center">Press ⌘+Enter to run</p>
    </form>
  );
};

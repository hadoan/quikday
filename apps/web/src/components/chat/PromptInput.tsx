import { useEffect, useState } from 'react';
import { Send, Sparkles, Eye, Zap, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('PromptInput');

export type RunMode = 'preview' | 'approval' | 'auto';

interface PromptInputProps {
  onSubmit: (prompt: string, mode: RunMode) => void;
  disabled?: boolean;
  placeholder?: string;
  initialValue?: string;
  defaultMode?: RunMode;
}

export const PromptInput = ({
  onSubmit,
  disabled = false,
  placeholder = "Type your intent... (e.g., 'Schedule a check-in with Sara tomorrow at 10')",
  initialValue,
  defaultMode = 'preview',
}: PromptInputProps) => {
  const [prompt, setPrompt] = useState(initialValue || '');
  const [mode, setMode] = useState<RunMode>(defaultMode);

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
        mode,
      });
      onSubmit(prompt, mode);
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
    <form onSubmit={handleSubmit} className="w-full space-y-3">
      {/* Mode Selector */}
      <div className="flex items-center justify-between">
        <div className="inline-flex items-center rounded-lg bg-muted p-1">
          <button
            type="button"
            onClick={() => setMode('preview')}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all',
              mode === 'preview'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
            title="Preview plan only (no execution)"
          >
            <Eye className="h-3.5 w-3.5" />
            Preview
          </button>
          <button
            type="button"
            onClick={() => setMode('approval')}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all',
              mode === 'approval'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
            title="Show plan and wait for approval"
          >
            <CheckCircle className="h-3.5 w-3.5" />
            Approval
          </button>
          <button
            type="button"
            onClick={() => setMode('auto')}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all',
              mode === 'auto'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
            title="Execute immediately without approval"
          >
            <Zap className="h-3.5 w-3.5" />
            Auto
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Press ⌘+Enter to run
        </p>
      </div>

      {/* Input Area */}
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
    </form>
  );
};

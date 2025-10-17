import { cn } from '@/lib/utils';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  children: React.ReactNode;
  className?: string;
}

export const ChatMessage = ({ role, children, className }: ChatMessageProps) => {
  return (
    <div
      className={cn(
        'flex w-full mb-6 animate-fade-in',
        role === 'user' ? 'justify-end' : 'justify-start',
        className,
      )}
    >
      <div
        className={cn(
          'max-w-[85%] rounded-xl px-5 py-3 transition-smooth',
          role === 'user'
            ? 'bg-primary text-primary-foreground ml-auto'
            : 'bg-card border border-border shadow-sm',
        )}
      >
        {children}
      </div>
    </div>
  );
};

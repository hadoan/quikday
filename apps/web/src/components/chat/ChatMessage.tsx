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
        'flex w-full mb-4 sm:mb-6 animate-fade-in',
        role === 'user' ? 'justify-end' : 'justify-start',
        className,
      )}
    >
      <div
        className={cn(
          'max-w-[95%] sm:max-w-[85%] transition-smooth',
          role === 'user'
            ? 'bg-primary text-primary-foreground ml-auto rounded-xl px-3 py-2 sm:px-5 sm:py-3 text-sm sm:text-base'
            : 'w-full',
        )}
      >
        {children}
      </div>
    </div>
  );
};

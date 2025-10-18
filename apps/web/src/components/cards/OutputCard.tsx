import { FileText, Copy, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

interface OutputCardProps {
  title: string;
  content: string;
  type?: 'text' | 'code' | 'summary';
}

export const OutputCard = ({ title, content, type = 'text' }: OutputCardProps) => {
  const { toast } = useToast();

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    toast({
      title: 'Copied!',
      description: 'Content copied to clipboard',
    });
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-4 animate-fade-in">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold text-foreground">{title}</h3>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" onClick={handleCopy} className="h-8 w-8">
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className={`p-4 rounded-lg bg-muted/50 ${type === 'code' ? 'font-mono text-sm' : ''}`}>
        <pre className="whitespace-pre-wrap text-foreground">{content}</pre>
      </div>
    </div>
  );
};

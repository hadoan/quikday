import { RotateCcw, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface UndoData {
  available: boolean;
  status?: 'pending' | 'completed';
  message?: string;
}

interface UndoCardProps {
  data: UndoData;
  onUndo?: () => void;
}

export const UndoCard = ({ data, onUndo }: UndoCardProps) => {
  if (!data.available) return null;

  return (
    <div
      className={cn(
        'rounded-xl border p-6 space-y-4 animate-fade-in',
        data.status === 'completed'
          ? 'border-success/20 bg-success/5'
          : 'border-accent/20 bg-accent/5',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-1">
          {data.status === 'completed' ? (
            <CheckCircle2 className="h-5 w-5 text-success" />
          ) : (
            <RotateCcw className="h-5 w-5 text-accent-foreground" />
          )}
        </div>
        <div className="flex-1 space-y-3">
          <div>
            <h3 className="font-semibold text-foreground mb-1">
              {data.status === 'completed' ? 'Undo Completed' : 'Undo Available'}
            </h3>
            <p className="text-sm text-muted-foreground">
              {data.message ||
                (data.status === 'completed'
                  ? 'All actions have been reversed'
                  : 'You can reverse this run with one tap')}
            </p>
          </div>
        </div>
      </div>

      {data.status !== 'completed' && onUndo && (
        <div className="flex justify-end pt-2">
          <Button
            onClick={onUndo}
            variant="outline"
            size="sm"
            className="gap-2 border-accent text-accent-foreground hover:bg-accent/10"
          >
            <RotateCcw className="h-4 w-4" />
            Undo Run
          </Button>
        </div>
      )}
    </div>
  );
};

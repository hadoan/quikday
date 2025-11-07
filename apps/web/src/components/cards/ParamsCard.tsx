import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Copy as CopyIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ParamsCardProps {
  title?: string;
  items: Array<{ key: string; value: string; full?: unknown }>;
}

export const ParamsCard = ({ title = 'Inputs', items }: ParamsCardProps) => {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<{ key: string; full: unknown } | null>(null);
  const { toast } = useToast();

  const openDetail = (key: string, full: unknown) => {
    setCurrent({ key, full });
    setOpen(true);
  };

  const renderCell = (it: { key: string; value: string; full?: unknown }) => {
    const isUrl = typeof it.value === 'string' && /^https?:\/\//i.test(it.value.trim());
    const isTrimmed = typeof it.value === 'string' && (/…$/.test(it.value) || /\.\.\.$/.test(it.value));
    const isStringifiedJson = typeof it.value === 'string' && (/^\s*\[/.test(it.value) || /^\s*\{/.test(it.value));
    const isComplex = Array.isArray(it.full) || (it.full !== null && typeof it.full === 'object');
    const showMore = isTrimmed || isComplex || isStringifiedJson || (typeof it.value === 'string' && it.value.length > 150);
    return (
      <div className="flex flex-col items-start gap-2">
        <div className="min-w-0 break-words">
          {isUrl ? (
            <a href={it.value} target="_blank" rel="noreferrer" className="text-primary underline break-all">
              {it.value}
            </a>
          ) : (
            it.value
          )}
        </div>
        {showMore && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={() => openDetail(it.key, it.full ?? it.value)}
          >
            Show more
          </Button>
        )}
      </div>
    );
  };

  const pretty = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') return v;
    try {
      return JSON.stringify(v, null, 2);
    } catch {
      return String(v);
    }
  };

  const handleCopy = (value: { value: string; full?: unknown }) => {
    try {
      const text = value.full !== undefined ? pretty(value.full) : value.value;
      navigator.clipboard.writeText(text);
      toast({ title: 'Copied', description: 'Field value copied to clipboard' });
    } catch {
      // ignore
    }
  };

  return (
    <>
      <div className="rounded-xl border border-border bg-card p-6 space-y-4 animate-fade-in">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-foreground">{title}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b">
                <th className="py-2 pr-4">Field</th>
                <th className="py-2">Value</th>
                <th className="py-2 w-[110px]"></th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td className="py-2 pr-4 align-top text-muted-foreground" colSpan={3}>
                    No inputs
                  </td>
                </tr>
              ) : (
                items.map((it, idx) => {
                  return (
                    <tr key={idx} className="border-b last:border-b-0 align-top">
                      <td className="py-2 pr-4 align-top font-medium text-foreground/90 whitespace-nowrap">
                        {it.key}
                      </td>
                      <td className="py-2 align-top text-foreground/90 break-words">{renderCell(it)}</td>
                      <td className="py-2 align-top text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2"
                            onClick={() => handleCopy(it)}
                            aria-label="Copy value"
                            title="Copy"
                          >
                            <CopyIcon className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>{current?.key || 'Detail'}</DialogTitle>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={() => current && handleCopy({ value: '', full: current.full })}
                aria-label="Copy detail"
                title="Copy"
              >
                <CopyIcon className="h-4 w-4" />
              </Button>
            </div>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-auto">
            <pre className="text-sm whitespace-pre-wrap break-words">{pretty(current?.full)}</pre>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ParamsCard;

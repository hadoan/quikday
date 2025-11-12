import { FileText, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { formatDateTime, formatTime } from '@/lib/datetime/format';
import type { UiOutputDataPresentation } from '@/apis/runs';

interface OutputCardProps {
  title: string;
  content: string;
  type?: 'text' | 'code' | 'summary';
  // Optional raw data and presentation hints so we can render dynamically
  data?: unknown;
  presentation?: UiOutputDataPresentation;
}

export const OutputCard = ({
  title,
  content,
  type = 'text',
  data,
  presentation,
}: OutputCardProps) => {
  const { toast } = useToast();

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    toast({
      title: 'Copied!',
      description: 'Content copied to clipboard',
    });
  };

  // Try to render friendlier, timezone-aware output using backend presentation hints first
  const renderContent = (() => {
    const isIso = (v: unknown) => typeof v === 'string' && !Number.isNaN(new Date(v).valueOf());
    const looksLikeSlot = (v: any) => v && isIso(v.start) && isIso(v.end);
    const tryParse = (s: string) => {
      try {
        return JSON.parse(s);
      } catch {
        return null;
      }
    };
    const getTz = () =>
      presentation?.tz && presentation.tz !== 'user' ? presentation.tz : undefined;
    const formatRange = (start: string, end: string) => {
      try {
        const sd = new Date(start);
        const ed = new Date(end);
        const sameDay = sd.toISOString().slice(0, 10) === ed.toISOString().slice(0, 10);
        if (sameDay) {
          const left = formatDateTime(sd, { dateStyle: 'medium', timeStyle: 'short', tz: getTz() });
          const right = formatTime(ed, { timeStyle: 'short', tz: getTz() });
          return `${left} → ${right}`;
        }
        return `${formatDateTime(sd, { tz: getTz() })} → ${formatDateTime(ed, { tz: getTz() })}`;
      } catch {
        return `${start} → ${end}`;
      }
    };
    const collectByPath = (root: any, path: string): string[] => {
      // Minimal JSONPath-lite support: name[*].prop
      try {
        const m = path.match(/^([a-zA-Z0-9_]+)\[\*\]\.([a-zA-Z0-9_]+)$/);
        if (!m) return [];
        const [, base, key] = m;
        const arr = Array.isArray(root?.[base]) ? (root[base] as any[]) : [];
        return arr.map((item) => item?.[key]).filter((v) => typeof v === 'string');
      } catch {
        return [];
      }
    };
    const slotsFrom = (val: any): Array<{ start: string; end: string }> | null => {
      // Use presentation.datetimePaths if provided
      if (presentation?.datetimePaths && presentation.datetimePaths.length >= 2) {
        const starts = collectByPath(val, presentation.datetimePaths[0]);
        const ends = collectByPath(val, presentation.datetimePaths[1]);
        const pairs: Array<{ start: string; end: string }> = [];
        for (let i = 0; i < Math.min(starts.length, ends.length); i++) {
          pairs.push({ start: starts[i], end: ends[i] });
        }
        if (pairs.length > 0) return pairs;
      }
      if (Array.isArray(val)) {
        const arr = val.filter((x) => looksLikeSlot(x)) as Array<{ start: string; end: string }>;
        return arr.length > 0 ? arr : null;
      }
      if (val && typeof val === 'object' && Array.isArray(val.slots)) {
        const arr = val.slots.filter((x: any) => looksLikeSlot(x)) as Array<{
          start: string;
          end: string;
        }>;
        return arr.length > 0 ? arr : null;
      }
      return null;
    };
    const transformDates = (val: any): any => {
      if (Array.isArray(val)) return val.map(transformDates);
      if (val && typeof val === 'object') {
        const out: any = {};
        for (const [k, v] of Object.entries(val)) {
          if (
            typeof v === 'string' &&
            isIso(v) &&
            (k === 'start' || k === 'end' || k.endsWith('At') || k.endsWith('_at'))
          ) {
            try {
              out[k] = formatDateTime(v, { tz: getTz() });
            } catch {
              out[k] = v;
            }
          } else {
            out[k] = transformDates(v);
          }
        }
        return out;
      }
      return val;
    };

    // Presentation-aware rendering first
    if (presentation && data) {
      if (presentation.type === 'slots') {
        const slots = slotsFrom(data);
        if (slots && slots.length > 0) {
          return slots.map((s) => `• ${formatRange(s.start, s.end)}`).join('\n');
        }
      }
      // 'json' or 'text' types with datetimePaths: pretty-print with localized times
      if (presentation.datetimePaths && Array.isArray(presentation.datetimePaths)) {
        try {
          return JSON.stringify(transformDates(data), null, 2);
        } catch {
          /* ignore */
        }
      }
    }

    // Fallback: sniff JSON content and prettify with local times
    const parsed = tryParse(content);
    if (parsed) {
      const slots = slotsFrom(parsed);
      if (slots) {
        return slots.map((s) => `• ${formatRange(s.start, s.end)}`).join('\n');
      }
      const transformed = transformDates(parsed);
      try {
        return JSON.stringify(transformed, null, 2);
      } catch {
        /* fall through */
      }
    }
    return content;
  })();

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
        <pre className="whitespace-pre-wrap text-foreground">{renderContent}</pre>
      </div>
    </div>
  );
};

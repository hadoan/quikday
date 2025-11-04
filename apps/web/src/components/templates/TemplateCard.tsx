import { Button } from '@/components/ui/button';
import type { Template } from '@/apis/templates';

export function TemplateCard({ t, onPrefill }: { t: Template; onPrefill: (text: string) => void }) {
  return (
    <article className="border rounded-xl p-4 flex flex-col h-full hover:border-primary/50 transition-colors">
      <div className="flex items-start gap-3 mb-3">
        {t.icon && (
          <div
            className="w-10 h-10 flex-shrink-0 text-primary"
            dangerouslySetInnerHTML={{ __html: t.icon }}
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="font-medium mb-1">{t.label}</div>
          {t.category && (
            <div className="text-xs text-muted-foreground capitalize mb-2">
              {t.category.replace(/-/g, ' ')}
            </div>
          )}
        </div>
      </div>
      <p className="text-sm text-muted-foreground line-clamp-3 mb-3">{t.sample_text}</p>
      <div className="mt-auto pt-3 flex gap-2">
        <Button variant="outline" size="sm" onClick={() => onPrefill(t.sample_text)}>
          Try this
        </Button>
      </div>
    </article>
  );
}

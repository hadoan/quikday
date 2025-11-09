import { Button } from '@/components/ui/button';
import type { Template } from '@/apis/templates';

export function TemplateCard({ t, onPrefill }: { t: Template; onPrefill: (text: string) => void }) {
  return (
    <article className="border rounded-xl p-3 sm:p-4 flex flex-col h-full hover:border-primary/50 transition-colors">
      <div className="flex items-start gap-2 sm:gap-3 mb-2 sm:mb-3">
        {t.icon && (
          <div
            className="w-8 h-8 sm:w-10 sm:h-10 flex-shrink-0 text-primary"
            dangerouslySetInnerHTML={{ __html: t.icon }}
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm sm:text-base mb-1">{t.label}</div>
          {t.category && (
            <div className="text-xs text-muted-foreground capitalize mb-1 sm:mb-2">
              {t.category.replace(/-/g, ' ')}
            </div>
          )}
        </div>
      </div>
      <p className="text-xs sm:text-sm text-muted-foreground line-clamp-3 mb-2 sm:mb-3">{t.sample_text}</p>
      <div className="mt-auto pt-2 sm:pt-3 flex gap-2">
        <Button variant="outline" size="sm" onClick={() => onPrefill(t.sample_text)} className="text-xs sm:text-sm">
          Try this
        </Button>
      </div>
    </article>
  );
}

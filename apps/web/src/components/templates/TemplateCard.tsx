import { Button } from '@/components/ui/button';
import type { Template } from '@/apis/templates';

export function TemplateCard({ t, onPrefill }: { t: Template; onPrefill: (text: string) => void }) {
  return (
    <article className="border rounded-xl p-4 flex flex-col h-full">
      <div className="font-medium mb-2">{t.label}</div>
      <p className="text-sm text-muted-foreground line-clamp-3 mb-3">{t.sample_text}</p>
      <div className="mt-auto pt-3 flex gap-2">
        <Button variant="outline" size="sm" onClick={() => onPrefill(t.sample_text)}>
          Try this
        </Button>
      </div>
    </article>
  );
}

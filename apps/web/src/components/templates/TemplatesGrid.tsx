import type { Template } from '@/apis/templates';
import { TemplateCard } from './TemplateCard';

export function TemplatesGrid({
  templates,
  onPrefill,
}: {
  templates: Template[];
  onPrefill: (text: string) => void;
}) {
  if (!templates?.length) {
    return <div className="text-muted-foreground text-sm">No templates yet.</div>;
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 auto-rows-fr">
      {templates.map((t) => (
        <TemplateCard key={t.id} t={t} onPrefill={onPrefill} />
      ))}
    </div>
  );
}

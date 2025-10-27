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
    return <div className="text-muted-foreground">No templates yet.</div>;
  }
  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-fr">
      {templates.map((t) => (
        <TemplateCard key={t.id} t={t} onPrefill={onPrefill} />
      ))}
    </div>
  );
}

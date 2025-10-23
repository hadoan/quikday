import { Button } from '@/components/ui/button';
import { Play } from 'lucide-react';

export const UseCases = () => {
  const cases = [
    {
      title: 'Launch Post (LI + X) → Log → Notify',
      description: '3 steps • Preview',
    },
    {
      title: 'Calendar & Meetings',
      description: 'propose slots → hold → invite — 4 steps • Preview',
    },
    {
      title: 'CRM Hygiene',
      description: 'log call → follow-up task → update stage — 4 steps • Preview',
    },
    {
      title: 'Finance Admin',
      description: 'export invoices → email summary → archive — 3 steps • Preview',
    },
  ];

  return (
    <section id="use-cases" className="py-24 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">What you can do (Routines)</h2>
          <p className="text-xl text-muted-foreground">
            Preview opens Plan & Diff. Run after connecting apps.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
          {cases.map((item) => (
            <div
              key={item.title}
              className="gradient-card rounded-2xl border border-border p-6 hover:shadow-lg transition-smooth"
            >
              <h3 className="text-xl font-bold mb-2">{item.title}</h3>
              <p className="text-sm text-muted-foreground mb-6">{item.description}</p>
              <div className="flex items-center justify-between pt-4 border-t border-border">
                <div className="text-xs text-muted-foreground">Plan & Diff available</div>
                <Button variant="ghost" size="sm">
                  <Play className="h-4 w-4" />
                  Preview (Plan & Diff)
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center mt-8">
          <a href="#templates" className="text-sm underline underline-offset-4">
            See more routines →
          </a>
        </div>
      </div>
    </section>
  );
};

import { Button } from '@/components/ui/button';
import { Play } from 'lucide-react';

export const Kits = () => {
  const kits = [
    {
      title: 'Multi-channel post',
      description: 'Post + first comment → Notion log → Slack proof',
      actions: 3,
      price: '€0.06',
    },
    {
      title: 'Calendly booking flow',
      description: 'Calendly → Google Calendar → Slack prep → CRM deal',
      actions: 4,
      price: '€0.08',
    },
    {
      title: 'Lead capture',
      description: 'Lead capture → HubSpot/Close upsert → follow-up task',
      actions: 3,
      price: '€0.06',
    },
    {
      title: 'Daily GTM recap',
      description: 'Mentions, leads, top posts → Slack/Notion',
      actions: 5,
      price: '€0.10',
    },
    {
      title: 'Content repurpose',
      description: 'X thread + LinkedIn carousel draft',
      actions: 2,
      price: '€0.04',
    },
    {
      title: 'Outreach from CSV',
      description: 'Outreach drafts from CSV → approve → queue',
      actions: 4,
      price: '€0.08',
    },
  ];

  return (
    <section id="kits" className="py-24">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            Ready-to-run{' '}
            <span className="bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">
              Kits
            </span>
          </h2>
          <p className="text-xl text-muted-foreground">
            Templates for common workflows. Run in seconds.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
          {kits.map((kit, index) => (
            <div
              key={index}
              className="gradient-card rounded-2xl border border-border p-6 hover:shadow-lg transition-smooth group"
            >
              <h3 className="text-xl font-bold mb-3">{kit.title}</h3>
              <p className="text-sm text-muted-foreground mb-6 min-h-[3rem]">{kit.description}</p>
              <div className="flex items-center justify-between pt-4 border-t border-border">
                <div className="text-sm text-muted-foreground">
                  {kit.actions} actions • {kit.price}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="group-hover:bg-primary group-hover:text-primary-foreground"
                >
                  <Play className="h-4 w-4" />
                  Preview run
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

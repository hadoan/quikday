import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export const Pricing = () => {
  const plans = [
    {
      name: 'Starter',
      price: '19',
      cadence: '/ mo',
      tagline: '1k steps, fast-undo, core Actions',
      features: ['Up to 1,000 steps / month', 'Fast Mode + 60s Undo', 'Core Actions'],
      cta: 'Start Starter',
    },
    {
      name: 'Pro',
      price: '49',
      cadence: '/ mo',
      tagline: '3–5 step chains, batch approvals, Daily Digest, issue triage',
      features: ['3–5 step chains', 'Batch approvals', 'Daily Digest', 'Issue triage'],
      cta: 'Start Pro',
      popular: true,
    },
    {
      name: 'Team',
      price: '99',
      cadence: '/ mo',
      tagline: 'Multi-workspace, audit export, webhooks, priority queue',
      features: ['Multi-workspace', 'Audit export', 'Webhooks', 'Priority queue'],
      cta: 'Start Team',
    },
  ];

  const ltd = {
    id: 'pricing-ltd',
    name: 'Early Adopter — LTD Solo',
    price: '29',
    cadence: 'one-time (limited)',
    bullets: [
      '100 runs / month • 300 Copilot messages / month',
      '1 user / 1 workspace',
      'Fast Mode + 60-sec Undo',
      'Plan & Diff on risky/multi-step',
      'Core integrations: Gmail, GCal, Slack, LinkedIn, X, Notion, Sheets/Airtable, HubSpot/Close (lite)',
      'Top-ups: €5 → +500 runs (60-day), €5 → +1,000 messages (60-day)',
    ],
    cta: 'Buy LTD (Solo)',
  };

  const addons = ['Private Runner/VPC', 'BYOK', 'Scheduling Pro'];

  return (
    <section id="pricing" className="py-24 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="text-center mb-10">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">Pricing</h2>
          <p className="text-xl text-muted-foreground">
            Choose a monthly plan. LTD for early adopters.
          </p>
        </div>

        {/* Monthly plans */}
        <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto mb-10">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative gradient-card rounded-2xl border p-8 transition-smooth ${
                plan.popular
                  ? 'border-primary/70 hover:shadow-glow'
                  : 'border-border hover:shadow-lg'
              }`}
            >
              {plan.popular && (
                <Badge className="mb-4" variant="default">
                  Most Popular
                </Badge>
              )}
              <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
              <div className="mb-3">
                <span className="text-5xl font-bold">€{plan.price}</span>
                <span className="text-muted-foreground"> {plan.cadence}</span>
              </div>
              <p className="text-sm text-muted-foreground mb-6">{plan.tagline}</p>
              <ul className="space-y-3 mb-8">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>
              <Button variant={plan.popular ? 'hero' : 'secondary'} className="w-full">
                {plan.cta}
              </Button>
            </div>
          ))}
        </div>

        {/* Small print */}
        <div className="max-w-4xl mx-auto mb-10">
          <p className="text-center text-xs text-muted-foreground">
            Overage <strong>€3 / 1k steps</strong>. Governance features (Plan & Diff, Approvals,
            Undo) included on all plans.
          </p>
        </div>

        {/* Add-ons */}
        <div className="max-w-6xl mx-auto mb-12">
          <div className="text-center mb-3 text-sm font-medium">Add-ons</div>
          <div className="flex flex-wrap justify-center gap-2">
            {addons.map((a) => (
              <span key={a} className="px-3 py-1.5 bg-card border border-border rounded-lg text-xs">
                {a}
              </span>
            ))}
          </div>
        </div>

        {/* LTD Card */}
        <div className="max-w-4xl mx-auto">
          <div
            id={ltd.id}
            className="relative gradient-card rounded-2xl border border-primary p-8 shadow-glow"
          >
            <div className="absolute -top-3 left-4">
              <Badge className="shadow" variant="default">
                Early Adopter
              </Badge>
            </div>
            <h3 className="text-2xl font-bold mb-2">{ltd.name}</h3>
            <div className="mb-4">
              <span className="text-5xl font-bold">€{ltd.price}</span>
              <span className="text-muted-foreground"> {ltd.cadence}</span>
            </div>
            <ul className="space-y-3 mb-8">
              {ltd.bullets.map((b) => (
                <li key={b} className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-sm">{b}</span>
                </li>
              ))}
            </ul>
            <Button variant="hero" className="w-full">
              {ltd.cta}
            </Button>
            <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
              LTDs are non-transferable; designed for early adopters, not high-volume production.
              Feature parity follows Starter/Pro; enterprise features (Team, Private Runner,
              SSO/SCIM, Audit export) are not included in LTD. Upgrade to monthly anytime — LTD
              benefits remain for the included limits.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

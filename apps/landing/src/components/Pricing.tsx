import { Button } from "@/components/ui/button";
import { Check, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const Pricing = () => {
  const plans = [
    {
      id: "pricing-ltd",
      name: "LTD",
      price: "29",
      cadence: "one-time",
      runs: "100 runs / month",
      messages: "300 Copilot messages / month",
      features: [
        "1 user • 1 workspace",
        "Fast Mode + Undo; Review for bulk/risky",
        "Core integrations (Gmail, Slack, LinkedIn, X, Notion, GCal, Sheets/Airtable, HubSpot/Close basic)",
        "Top-ups: €5 → +500 runs (60-day) • €5 → +1,000 messages (60-day)",
      ],
      cta: "Get Lifetime (€29)",
      ltd: true,
    },
    {
      name: "Starter",
      price: "19",
      cadence: "/ month",
      runs: "150 runs / month",
      messages: "100 Copilot messages / month",
      features: [
        "1 workspace • Fast Mode + Undo",
        "Review when it counts (auto on bulk/risky)",
      ],
      cta: "Start Starter",
    },
    {
      name: "Pro",
      price: "49",
      cadence: "/ month",
      runs: "600 runs / month",
      messages: "500 Copilot messages / month",
      features: [
        "3 workspaces • Bulk rules • Priority queue",
        "Import from Zapier/Make (preview → run)",
      ],
      cta: "Start Pro",
      popular: true,
    },
    {
      name: "Team",
      price: "99",
      cadence: "/ month",
      runs: "2,500 runs / month",
      messages: "2,000 Copilot messages / month",
      features: [
        "Role gates • Audit export • Webhooks",
        "Priority support",
      ],
      cta: "Start Team",
    },
  ];

  return (
    <section id="pricing" className="py-24 bg-muted/30">
      <div className="container mx-auto px-4">
        {/* LTD banner */}
        <div className="max-w-5xl mx-auto mb-6">
          <div className="flex items-center justify-center gap-2 text-sm bg-accent/40 border border-border rounded-xl px-4 py-2">
            <span className="font-medium">Early LTD available — €29 one-time.</span>
            <a href="#pricing-ltd" className="underline underline-offset-4">Get Lifetime</a>
          </div>
        </div>

        <div className="text-center mb-10">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            Simple,{" "}
            <span className="bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">
              honest pricing
            </span>
          </h2>
          <p className="text-xl text-muted-foreground">
            Clear per-run pricing. No hidden fees.
          </p>
        </div>

        <div className="grid md:grid-cols-4 gap-6 max-w-6xl mx-auto mb-10">
          {plans.map((plan, index) => (
            <div
              key={index}
              id={plan.id}
              className={`relative gradient-card rounded-2xl border p-8 transition-smooth ${
                plan.ltd
                  ? 'border-primary shadow-glow'
                  : plan.popular
                  ? 'border-primary/70 hover:shadow-glow'
                  : 'border-border hover:shadow-lg'
              }`}
            >
              {plan.ltd && (
                <div className="absolute -top-3 left-4">
                  <Badge className="shadow" variant="default">Early LTD</Badge>
                </div>
              )}
              {plan.popular && !plan.ltd && (
                <Badge className="mb-4" variant="default">Most Popular</Badge>
              )}
              <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
              <div className="mb-4">
                <span className="text-5xl font-bold">€{plan.price}</span>
                {plan.cadence && <span className="text-muted-foreground"> {plan.cadence}</span>}
              </div>
              <p className="text-muted-foreground mb-1">{plan.runs}</p>
              {plan.messages && (
                <p className="text-muted-foreground mb-6">{plan.messages}</p>
              )}

              <ul className="space-y-3 mb-8">
                {plan.features.map((feature, fIndex) => (
                  <li key={fIndex} className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>

              <Button
                variant={plan.ltd || plan.popular ? "hero" : "secondary"}
                className="w-full"
              >
                {plan.cta}
              </Button>
              {plan.ltd && (
                <p className="mt-2 text-xs text-muted-foreground text-center">One-time, yours forever</p>
              )}
            </div>
          ))}
        </div>

        <div className="max-w-4xl mx-auto">
          <p className="text-center text-xs text-muted-foreground leading-relaxed">
            <strong>Runs</strong> = executions that touch your apps. <strong>Copilot messages</strong> = planning chat & drafts. Per-run overage (if enabled outside LTD):
            <strong> €0.02–€0.05 / run</strong>.
            <br />
            Fair-use throttles apply (daily caps, output limits). Planning remains available when caps are reached; execution resumes on reset or top-up.
          </p>
        </div>
      </div>
    </section>
  );
};

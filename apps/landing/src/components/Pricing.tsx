import { Button } from "@/components/ui/button";
import { Check, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const Pricing = () => {
  const plans = [
    {
      name: "Starter",
      price: "19",
      runs: "150 runs/mo",
      features: [
        "1 workspace",
        "Fast Mode + Undo",
        "All integrations",
        "Email support",
      ],
    },
    {
      name: "Pro",
      price: "49",
      runs: "600 runs/mo",
      features: [
        "3 workspaces",
        "Review Mode + bulk rules",
        "Priority support",
        "Custom kits",
      ],
      popular: true,
    },
    {
      name: "Team",
      price: "99",
      runs: "2,500 runs/mo",
      features: [
        "Unlimited workspaces",
        "Role gates",
        "Audit export",
        "Dedicated support",
      ],
    },
  ];

  return (
    <section id="pricing" className="py-24 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            Simple,{" "}
            <span className="bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">
              honest pricing
            </span>
          </h2>
          <p className="text-xl text-muted-foreground mb-4">
            Clear per-run pricing. No hidden fees.
          </p>
          <Badge variant="secondary" className="px-4 py-1.5">
            <Zap className="h-3 w-3 mr-1" />
            Lifetime Deal €19 — Limited early adopters
          </Badge>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto mb-12">
          {plans.map((plan, index) => (
            <div 
              key={index}
              className={`gradient-card rounded-2xl border p-8 transition-smooth ${
                plan.popular 
                  ? 'border-primary shadow-glow scale-105' 
                  : 'border-border hover:shadow-lg'
              }`}
            >
              {plan.popular && (
                <Badge className="mb-4" variant="default">Most Popular</Badge>
              )}
              <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
              <div className="mb-6">
                <span className="text-5xl font-bold">€{plan.price}</span>
                <span className="text-muted-foreground">/mo</span>
              </div>
              <p className="text-muted-foreground mb-6">{plan.runs}</p>
              
              <ul className="space-y-3 mb-8">
                {plan.features.map((feature, fIndex) => (
                  <li key={fIndex} className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>

              <Button 
                variant={plan.popular ? "hero" : "secondary"} 
                className="w-full"
              >
                Get Started
              </Button>
            </div>
          ))}
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Overage: €0.02–€0.05 per run • Cancel anytime • 14-day money-back guarantee
        </p>
      </div>
    </section>
  );
};

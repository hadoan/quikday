import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Github, Play, Undo2 } from "lucide-react";
import heroBg from "@/assets/hero-bg.jpg";

export const Hero = () => {
  return (
    <section className="relative min-h-[90vh] flex items-center overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 z-0">
        <img 
          src={heroBg} 
          alt="" 
          className="w-full h-full object-cover opacity-20"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background/50 to-background" />
      </div>

      <div className="container mx-auto px-4 py-20 relative z-10">
        <div className="max-w-5xl mx-auto text-center">
          {/* Badge */}
          <Badge variant="secondary" className="mb-6 px-4 py-1.5 text-sm">
            Open source • Built in public
          </Badge>

          {/* Main Headline */}
          <h1 className="text-5xl md:text-7xl font-bold mb-6 tracking-tight">
            Run work fast.{" "}
            <span className="bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">
              Review only when it matters.
            </span>
          </h1>

          {/* Subheadline */}
          <p className="text-xl md:text-2xl text-muted-foreground mb-2 max-w-3xl mx-auto leading-relaxed">
            One-tap runs for simple tasks. A short summary screen for bulk or risky changes—
            <span className="font-semibold text-foreground"> Undo built-in</span>. 
            Clear per-run pricing.
          </p>

          {/* Trust strip */}
          <p className="text-sm md:text-base text-foreground/80 mb-1 font-medium">
            No switching. No friction. No babysitting.
          </p>

          {/* Apps line */}
          <p className="text-sm text-muted-foreground mb-6">
            Works with Gmail, Slack, CRMs, QuickBooks, calendars, Notion, Sheets, and more.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
            <Button variant="hero" size="lg" className="min-w-[180px]">
              Join Beta
            </Button>
            <Button variant="secondary" size="lg" className="min-w-[180px]" asChild>
              <a href="https://github.com/hadoan/quikday" target="_blank" rel="noopener noreferrer">
                <Github className="h-5 w-5" />
                View on GitHub
              </a>
            </Button>
           
          </div>

          {/* Demo Card */}
          <div className="max-w-3xl mx-auto">
            <div className="gradient-card rounded-2xl border border-border p-6 shadow-lg hover:shadow-glow transition-smooth">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold mb-2 text-left">Quick Multi-Channel Post</h3>
                  <div className="text-sm text-muted-foreground text-left space-y-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-primary" />
                      <span>Create LinkedIn + X post</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-primary" />
                      <span>Log to Notion</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-primary" />
                      <span>Notify Slack</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-accent/50 px-3 py-1.5 rounded-lg">
                  <Undo2 className="h-3 w-3" />
                  <span>Undo 60s</span>
                </div>
              </div>
              <div className="pt-4 border-t border-border flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">3 actions • €0.06</span>
                  <span
                    className="text-xs px-2 py-1 rounded bg-accent/50 text-muted-foreground"
                    title="A run can include multiple steps. You’re billed per run, not per step."
                  >
                    Est. cost: Included in plan
                  </span>
                </div>
                <Button size="sm">Run now</Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

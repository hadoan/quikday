import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Github, Play, X } from "lucide-react";
import heroBg from "@/assets/hero-bg.jpg";

export const Hero = () => {
  const [showDemo, setShowDemo] = useState(false);
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
            Kill tab-switching. Ship work.
          </h1>

          {/* Subheadline */}
          <p className="text-xl md:text-2xl text-muted-foreground mb-2 max-w-4xl mx-auto leading-relaxed">
            Press an <span className="font-semibold text-foreground">Action</span>, see <span className="font-semibold text-foreground">Plan & Diff</span>, <span className="font-semibold text-foreground">Approve</span>, and it runs — with <span className="font-semibold text-foreground">Undo</span> and <span className="font-semibold text-foreground">audit</span> built in.
            Not a workflow builder. A <span className="font-semibold text-foreground">governed command console</span> for email, calendar, tasks, and social.
          </p>

          {/* Trust strip */}
          <p className="text-sm md:text-base text-foreground/80 mb-6 font-medium">
            Plan & Diff → Approve → Undo. Governed by default.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
            <Button
              variant="hero"
              size="lg"
              className="min-w-[220px]"
              data-ab="hero-demo-primary"
              onClick={() => setShowDemo(true)}
            >
              <Play className="h-5 w-5" />
              See 30-second demo
            </Button>
            <Button variant="secondary" size="lg" className="min-w-[160px]" asChild>
              <a href="#join-beta" data-ab="hero-joinbeta-secondary">Join Beta</a>
            </Button>
            <Button variant="outline" size="lg" className="min-w-[180px]" asChild>
              <a
                href="https://github.com/hadoan/quikday"
                target="_blank"
                rel="noopener noreferrer"
                data-ab="hero-github-tertiary"
              >
                <Github className="h-5 w-5" />
                View on GitHub
              </a>
            </Button>
          </div>

          {/* Demo visual */}
          {/* <div className="max-w-3xl mx-auto">
            <div className="rounded-2xl border border-border p-2 shadow-lg overflow-hidden bg-card">
              <div className="aspect-video w-full bg-muted flex items-center justify-center">
                <img
                  src="/demo/plan-approve-undo.gif"
                  alt="Demo: Plan & Diff → Approve → Undo"
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
              <div className="px-4 py-3 text-sm text-muted-foreground">
                Plan & Diff → Approve → Undo. Rollback appears on the timeline.
              </div>
            </div>
          </div> */}

          {/* Modal: 30-second demo */}
          {showDemo && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
              role="dialog"
              aria-modal="true"
            >
              <div className="relative w-full max-w-3xl rounded-2xl border border-border bg-card shadow-xl overflow-hidden">
                <button
                  onClick={() => setShowDemo(false)}
                  className="absolute right-3 top-3 p-2 rounded-lg hover:bg-muted"
                  aria-label="Close demo"
                >
                  <X className="h-5 w-5" />
                </button>
                <div className="aspect-video w-full bg-muted">
                  <img
                    src="/demo/plan-approve-undo.gif"
                    alt="Demo: Plan & Diff → Approve → Undo"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="px-5 py-4 text-sm text-muted-foreground">
                  Plan & Diff preview → Approve → Undo. Governance on.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

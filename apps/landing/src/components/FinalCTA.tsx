import { Button } from "@/components/ui/button";
import { Github } from "lucide-react";

export const FinalCTA = () => {
  return (
    <section className="py-24">
      <div className="container mx-auto px-4">
        <div className="gradient-card rounded-2xl border border-border p-10 text-center max-w-4xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">One prompt. One run. Done.</h2>
          <p className="text-muted-foreground mb-8">Cancel anytime. Keep your data.</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button variant="hero" size="lg" asChild>
              <a href="#join-beta">Join Beta</a>
            </Button>
            <Button variant="secondary" size="lg" asChild>
              <a href="https://github.com/hadoan/quikday" target="_blank" rel="noopener noreferrer">
                <Github className="h-5 w-5" />
                View on GitHub
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};


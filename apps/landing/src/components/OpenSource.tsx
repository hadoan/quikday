import { Button } from "@/components/ui/button";
import { Github, Star, GitBranch, Users } from "lucide-react";

export const OpenSource = () => {
  return (
    <section id="opensource" className="py-24">
      <div className="container mx-auto px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              <span className="bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">
                Open source
              </span>{" "}
              & built in public
            </h2>
            <p className="text-xl text-muted-foreground">
              Quik.day is open source and built in public. Star the repo, follow the roadmap, and contribute.
            </p>
          </div>

          <div className="gradient-card rounded-2xl border border-border p-8 mb-8">
            <div className="flex flex-wrap gap-4 justify-center mb-8">
              <Button variant="hero" asChild>
                <a href="https://github.com/hadoan/quikday" target="_blank" rel="noopener noreferrer">
                  <Github className="h-5 w-5" />
                  GitHub repo
                  <Star className="h-4 w-4 ml-1" />
                </a>
              </Button>
              <Button variant="secondary" asChild>
                <a href="#roadmap">
                  <GitBranch className="h-5 w-5" />
                  Roadmap
                </a>
              </Button>
              <Button variant="secondary" asChild>
                <a href="#changelog">
                  Changelog
                </a>
              </Button>
              <Button variant="secondary" asChild>
                <a href="#community">
                  <Users className="h-5 w-5" />
                  Community
                </a>
              </Button>
            </div>

            <div className="bg-muted/50 rounded-xl p-6 font-mono text-sm">
              <div className="text-muted-foreground mb-2"># Quick start</div>
              <code className="text-foreground">
                git clone https://github.com/hadoan/quikday<br />
                cd quikday && pnpm i && pnpm dev
              </code>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 justify-center">
            <div className="px-4 py-2 bg-accent/50 rounded-lg text-sm font-medium">
              MIT License
            </div>
            <div className="px-4 py-2 bg-accent/50 rounded-lg text-sm font-medium">
              Contributions welcome
            </div>
            <div className="px-4 py-2 bg-accent/50 rounded-lg text-sm font-medium">
              Good first issues
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Github } from "lucide-react";
import { useState } from "react";

export const BetaSignup = () => {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [teamSize, setTeamSize] = useState("");
  const [useCase, setUseCase] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Handle form submission
    console.log({ email, role, teamSize, useCase });
  };

  return (
    <section className="py-24">
      <div className="container mx-auto px-4">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              Join the{" "}
              <span className="bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">
                Beta
              </span>
            </h2>
            <p className="text-xl text-muted-foreground">
              No spam. We'll email when your spot opens.
            </p>
          </div>

          <div className="gradient-card rounded-2xl border border-border p-8 shadow-lg">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <Label htmlFor="email">Email *</Label>
                <Input 
                  id="email" 
                  type="email" 
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="mt-2"
                />
              </div>

              <div>
                <Label htmlFor="role">Role</Label>
                <select 
                  id="role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full mt-2 h-11 px-4 rounded-xl border border-input bg-background text-sm transition-smooth focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">Select your role</option>
                  <option value="founder">Founder</option>
                  <option value="indie">Indie Hacker</option>
                  <option value="gtm">GTM Team Member</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <Label htmlFor="teamSize">Team size</Label>
                <Input 
                  id="teamSize" 
                  type="text" 
                  placeholder="e.g., 1-5"
                  value={teamSize}
                  onChange={(e) => setTeamSize(e.target.value)}
                  className="mt-2"
                />
              </div>

              <div>
                <Label htmlFor="useCase">Main use-case</Label>
                <textarea 
                  id="useCase"
                  value={useCase}
                  onChange={(e) => setUseCase(e.target.value)}
                  placeholder="What workflows would you automate?"
                  className="w-full mt-2 px-4 py-3 rounded-xl border border-input bg-background text-sm transition-smooth focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 min-h-[100px] resize-y"
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <Checkbox id="updates" />
                  <Label htmlFor="updates" className="text-sm font-normal cursor-pointer">
                    Get build-in-public updates
                  </Label>
                </div>
                <div className="flex items-start gap-3">
                  <Checkbox id="selfhost" />
                  <Label htmlFor="selfhost" className="text-sm font-normal cursor-pointer">
                    Notify me about self-host/OSS
                  </Label>
                </div>
              </div>

              <div className="space-y-3 pt-4">
                <Button type="submit" variant="hero" className="w-full" size="lg">
                  Join Beta
                </Button>
                <Button type="button" variant="secondary" className="w-full" size="lg" asChild>
                  <a href="https://github.com/quikday/quikday" target="_blank" rel="noopener noreferrer">
                    <Github className="h-5 w-5" />
                    Sign up with GitHub
                  </a>
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
};

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, FileClock, ShieldAlert, Undo2 } from "lucide-react";

export const HowItWorks = () => {
  return (
    <section id="how-it-works" className="py-24">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">How it works</h2>
          <p className="text-xl text-muted-foreground">
            One prompt. One tap or a short review. Every run audited and undoable.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {/* Step 1 */}
          <div className="gradient-card rounded-2xl border border-border p-6">
            <div className="mb-4 flex items-center gap-2">
              <Badge>Step 1</Badge>
              <span className="text-sm text-muted-foreground">One Prompt</span>
            </div>
            <h3 className="text-xl font-bold mb-2">One prompt</h3>
            <p className="text-muted-foreground mb-4">Tell Quik.day what you need. We propose a short plan (2–5 steps) with <span className="font-medium text-foreground">Plan & Diff</span> and required scopes.</p>
            <div className="rounded-xl border border-dashed border-border p-4 text-sm">
              <div className="font-mono text-xs text-muted-foreground mb-2">Plan</div>
              <ul className="space-y-2">
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary"/> Check calendar</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary"/> Create event draft</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary"/> Send invite</li>
              </ul>
              <div className="mt-3 text-xs text-muted-foreground" title="Estimates are visible inside the Plan (not on hero).">Estimated calls: 4 • 3 actions</div>
            </div>
          </div>

          {/* Step 2 */}
          <div className="gradient-card rounded-2xl border border-border p-6">
            <div className="mb-4 flex items-center gap-2">
              <Badge>Step 2</Badge>
              <span className="text-sm text-muted-foreground">One Tap or Review</span>
            </div>
            <h3 className="text-xl font-bold mb-2">One tap or review</h3>
            <p className="text-muted-foreground mb-4">Safe single‑step runs execute instantly (60‑second <span className="font-medium text-foreground">Undo</span> toast). <span className="font-medium text-foreground">Public/bulk/external</span> changes open a short <span className="font-medium text-foreground">Confirm</span> screen.</p>
            <div className="rounded-xl border border-dashed border-border p-4 text-sm space-y-2">
              <div className="flex items-center justify-between">
                <div className="font-medium">Confirm</div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <ShieldAlert className="h-3.5 w-3.5"/> Medium risk
                </div>
              </div>
              <ul className="space-y-2">
                <li>• Post to LinkedIn (1)</li>
                <li>• Post to X (1)</li>
                <li>• Log to Notion (1)</li>
              </ul>
              <div className="flex items-center justify-between pt-3 border-t border-border">
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><Undo2 className="h-3.5 w-3.5"/> Undo 60s</div>
                <Button size="sm">Execute</Button>
              </div>
            </div>
          </div>

          {/* Step 3 */}
          <div className="gradient-card rounded-2xl border border-border p-6">
            <div className="mb-4 flex items-center gap-2">
              <Badge>Step 3</Badge>
              <span className="text-sm text-muted-foreground">Audit & Undo</span>
            </div>
            <h3 className="text-xl font-bold mb-2">Audit & Undo</h3>
            <p className="text-muted-foreground mb-4">Every run has a timeline, diffs, and one‑click <span className="font-medium text-foreground">Undo</span>. Policies enforce quiet hours, reviewer rules, and risk caps.</p>
            <div className="rounded-xl border border-dashed border-border p-4 text-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-medium">Timeline</div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><FileClock className="h-3.5 w-3.5"/> 11:02</div>
              </div>
              <div>Planned → Executed → Summarized</div>
              <div className="text-xs text-muted-foreground">View diffs and outputs</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

import { Star } from "lucide-react";

export const SocialProof = () => {
  const testimonials = [
    "Saved 6 hrs/week on GTM ops",
    "Cut Zapier cost by 38%",
    "Zero accidents in 60 days",
  ];

  const changelog = [
    { version: "v0.8.2", title: "Slack reply threading", date: "2 days ago" },
    { version: "v0.8.1", title: "QuickBooks OAuth", date: "1 week ago" },
    { version: "v0.8.0", title: "Undo for email sends", date: "2 weeks ago" },
  ];

  return (
    <section className="py-24 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="max-w-5xl mx-auto">
          {/* Testimonials */}
          <div className="text-center mb-16">
            <h3 className="text-2xl font-bold mb-8">
              Built in public. Trusted by early adopters.
            </h3>
            <div className="flex flex-wrap justify-center gap-6">
              {testimonials.map((quote, index) => (
                <div 
                  key={index}
                  className="gradient-card rounded-xl border border-border px-6 py-4 max-w-xs"
                >
                  <p className="text-sm font-medium">"{quote}"</p>
                </div>
              ))}
            </div>
          </div>

          {/* GitHub Stats + Changelog */}
          <div className="grid md:grid-cols-2 gap-8">
            {/* GitHub */}
            <div className="gradient-card rounded-2xl border border-border p-6">
              <h4 className="text-lg font-bold mb-4 flex items-center gap-2">
                <Star className="h-5 w-5 text-primary" />
                GitHub Activity
              </h4>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Stars</span>
                  <span className="font-bold">1.2k</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Forks</span>
                  <span className="font-bold">87</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Contributors</span>
                  <span className="font-bold">23</span>
                </div>
              </div>
            </div>

            {/* Changelog */}
            <div id="changelog" className="gradient-card rounded-2xl border border-border p-6">
              <h4 className="text-lg font-bold mb-4">Latest Updates</h4>
              <div className="space-y-4">
                {changelog.map((item, index) => (
                  <div key={index}>
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="font-mono text-xs text-primary">{item.version}</span>
                      <span className="text-sm font-medium">{item.title}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{item.date}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

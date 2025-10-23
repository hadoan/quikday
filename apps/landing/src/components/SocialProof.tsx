import { Star } from 'lucide-react';

export const SocialProof = () => {
  const quotes = [
    { text: '“I ship faster with fewer tabs.”', role: 'Founder', name: 'Lea' },
    { text: '“The confirm screen gives me confidence.”', role: 'Ops Lead', name: 'Sam' },
  ];

  return (
    <section className="py-24 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="max-w-5xl mx-auto">
          {/* Logos/stat + quotes */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center px-4 py-2 rounded-xl bg-accent/50 border border-border text-sm font-medium">
              1,000+ tasks executed in beta
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {quotes.map((q) => (
              <div key={q.text} className="gradient-card rounded-2xl border border-border p-6">
                <p className="mb-3">{q.text}</p>
                <p className="text-xs text-muted-foreground">
                  {q.role} • {q.name}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

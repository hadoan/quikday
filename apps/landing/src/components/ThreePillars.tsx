export const ThreePillars = () => {
  const pillars = [
    {
      title: 'Fast by default',
      description: 'Most actions run instantly; toast with Undo (60s).',
      icon: (
        <svg
          width="56"
          height="56"
          viewBox="0 0 60 60"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-label="Fast"
        >
          <circle cx="30" cy="30" r="28" stroke="currentColor" strokeWidth="2" />
          <path
            d="M18 30h24M30 18l12 12-12 12"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
    },
    {
      title: 'Review when it counts',
      description: 'Auto-detect bulk/destructive changes → one-line summary review.',
      icon: (
        <svg
          width="56"
          height="56"
          viewBox="0 0 60 60"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-label="Review"
        >
          <rect x="9" y="12" width="42" height="30" rx="4" stroke="currentColor" strokeWidth="2" />
          <path
            d="M16 20h20M16 28h28"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="42" cy="44" r="8" stroke="currentColor" strokeWidth="2" />
          <path d="M47 49l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      title: 'Undo built-in',
      description: 'Revert common actions where APIs allow.',
      icon: (
        <svg
          width="56"
          height="56"
          viewBox="0 0 60 60"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-label="Undo"
        >
          <path
            d="M20 22v-8l-8 8 8 8v-8h10c8 0 14 6 14 14 0 3-1 6-3 8"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
    },
  ];

  return (
    <section className="py-24">
      <div className="container mx-auto px-4">
        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {pillars.map((pillar, index) => (
            <div
              key={index}
              className="gradient-card rounded-2xl border border-border p-8 text-center hover:shadow-lg transition-smooth group"
            >
              <div className="inline-flex items-center justify-center mb-6 text-primary group-hover:scale-110 transition-smooth">
                {pillar.icon}
              </div>
              <h3 className="text-2xl font-bold mb-4">{pillar.title}</h3>
              <p className="text-muted-foreground leading-relaxed">{pillar.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

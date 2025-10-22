export const Trust = () => {
  const bullets = [
    'BYOK where possible',
    'Per-run logs & audit trail',
    'Clear scopes & permissions',
    'Undo coverage map per Action',
    'Data residency (when available)',
  ];

  const metrics = [
    { label: 'Success rate', value: '99.2%' },
    { label: 'Undo coverage', value: '84% Actions' },
    { label: 'Drift MTTR', value: '14m' },
  ];

  return (
    <section id="trust" className="py-24">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto text-center mb-10">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">Your data, your control.</h2>
          <p className="text-lg text-muted-foreground">Governance and reliability by default.</p>
        </div>
        <div className="max-w-3xl mx-auto grid gap-3">
          {bullets.map((b) => (
            <div key={b} className="gradient-card rounded-xl border border-border p-4 text-sm text-left">
              {b}
            </div>
          ))}
        </div>

        {/* Reliability strip */}
        <div className="max-w-4xl mx-auto mt-8 text-center">
          <div className="text-sm font-medium mb-3">Live Reliability Board</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {metrics.map((m) => (
              <div key={m.label} className="gradient-card rounded-xl border border-border p-4">
                <div className="text-2xl font-bold">{m.value}</div>
                <div className="text-xs text-muted-foreground">{m.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="text-center mt-6 text-sm">
          <a href="#privacy" className="underline underline-offset-4 mr-4">Privacy</a>
          <a href="#security" className="underline underline-offset-4 mr-4">Security</a>
          <a href="#terms" className="underline underline-offset-4">Terms</a>
        </div>
      </div>
    </section>
  );
};

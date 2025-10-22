export const GovernanceStrip = () => {
  const items = [
    "Plan & Diff preview",
    "Approval policies",
    "Least-privilege tokens",
    "One-click Undo",
    "Full audit trail",
  ];

  return (
    <section className="py-12 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="max-w-6xl mx-auto text-center">
          <h3 className="text-xl font-bold mb-4">Governed by default</h3>
          <div className="flex flex-wrap justify-center gap-2">
            {items.map((i) => (
              <span key={i} className="px-3 py-1.5 bg-card border border-border rounded-lg text-xs">
                {i}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};


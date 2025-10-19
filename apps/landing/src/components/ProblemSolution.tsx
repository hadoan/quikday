export const ProblemSolution = () => {
  const apps = [
    "Gmail", "Slack", "HubSpot", "Notion", "QuickBooks", 
    "Google Calendar", "Close CRM", "Sheets", "Airtable"
  ];

  return (
    <section className="py-24 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto text-center">
          {/* Problem */}
          <p className="text-xl md:text-2xl text-muted-foreground mb-6 leading-relaxed">
            Too many tabs, too little focus. Switching between Slack, your CRM, email, 
            calendars, and docs wrecks momentum.
          </p>

          {/* Outcome */}
          <h2 className="text-3xl md:text-5xl font-bold mb-6">
            <span className="bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">
              Quik.day
            </span>{" "}
            plugs into your stack and executes—so you save time and stick to the work that matters.
          </h2>

          {/* Apps Grid */}
          <div className="mb-8">
            <p className="text-lg text-muted-foreground mb-6">
              Works with Gmail, Slack, CRMs, QuickBooks, calendars, Notion, Sheets, and more.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              {apps.map((app) => (
                <span 
                  key={app} 
                  className="px-4 py-2 bg-card border border-border rounded-lg text-sm font-medium hover:border-primary transition-smooth"
                >
                  {app}
                </span>
              ))}
            </div>
          </div>

          {/* Trust Note */}
          <p className="text-2xl md:text-3xl font-bold">
            No switching. No friction. No babysitting.
          </p>
        </div>
      </div>
    </section>
  );
};

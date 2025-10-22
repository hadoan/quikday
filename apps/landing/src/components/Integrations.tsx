export const Integrations = () => {
  const current = [
    { name: "Gmail", logoSrc: "/logo/gmail.svg" },
    { name: "Google Calendar", logoSrc: "/logo/googlecalendar.svg" },
    { name: "Slack", logoSrc: "/logo/slack.svg" },
    { name: "Notion", logoSrc: "/logo/notion.svg" },
    { name: "LinkedIn", logoSrc: "/logo/linkedin.svg" },
    { name: "X", logoSrc: "/logo/x.svg" },
    { name: "HubSpot", logoSrc: "/logo/hubspot.svg" },
    { name: "Close", logoSrc: "/logo/closecrm.svg" },
    { name: "QuickBooks", logoSrc: "/logo/quickbooks.svg" },
    { name: "Sheets", logoSrc: "/logo/googlesheets.svg" },
    { name: "Airtable", logoSrc: "/logo/airtable.svg" },
  ];
  const comingSoon = ["Trello", "Asana", "Linear", "Monday.com", "GitHub", "Jira"];

  return (
    <section id="integrations" className="py-24 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">Keep your stack.</h2>
          <p className="text-lg text-muted-foreground mb-10">Quik.day executes across the tools you already use.</p>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-10">
            {current.map((integration) => (
              <div
                key={integration.name}
                className="gradient-card rounded-xl border border-border p-6 hover:shadow-lg hover:border-primary transition-smooth group"
              >
                <div className="text-center">
                  <div className="w-12 h-12 mx-auto mb-3 bg-primary/10 rounded-lg flex items-center justify-center group-hover:bg-primary/20 transition-smooth">
                    <img
                      src={integration.logoSrc}
                      alt={`${integration.name} logo`}
                      className="h-6 w-6 dark:invert"
                      width={24}
                      height={24}
                      loading="lazy"
                    />
                  </div>
                  <p className="font-semibold text-sm">{integration.name}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mb-6">
            <p className="text-sm font-medium mb-3">Coming soon</p>
            <div className="flex flex-wrap justify-center gap-2">
              {comingSoon.map((name) => (
                <span key={name} className="px-3 py-1.5 bg-card border border-border rounded-lg text-xs">
                  {name}
                </span>
              ))}
            </div>
          </div>

          <p className="text-sm text-muted-foreground">Integrations are expanding. BYOK where supported.</p>
        </div>
      </div>
    </section>
  );
};

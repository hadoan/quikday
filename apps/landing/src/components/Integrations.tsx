export const Integrations = () => {
  const integrations = [
    { name: "LinkedIn", oauth: true },
    { name: "X/Twitter", oauth: true, byok: true },
    { name: "Slack", oauth: true },
    { name: "Notion", oauth: true },
    { name: "Google Calendar", oauth: true },
    { name: "Google Drive", oauth: true },
    { name: "Gmail", oauth: true },
    { name: "HubSpot", oauth: true },
    { name: "Close CRM", oauth: true },
    { name: "Google Sheets", oauth: true },
    { name: "Airtable", oauth: true },
    { name: "QuickBooks", oauth: true },
  ];

  return (
    <section id="integrations" className="py-24 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            Connects to your{" "}
            <span className="bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">
              entire stack
            </span>
          </h2>
          <p className="text-xl text-muted-foreground mb-12">
            Start in preview (no write). Approve to execute.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
            {integrations.map((integration, index) => (
              <div 
                key={index}
                className="gradient-card rounded-xl border border-border p-6 hover:shadow-lg hover:border-primary transition-smooth group"
                title={integration.byok ? "OAuth default; BYOK optional" : "OAuth"}
              >
                <div className="text-center">
                  <div className="w-12 h-12 mx-auto mb-3 bg-primary/10 rounded-lg flex items-center justify-center text-2xl group-hover:bg-primary/20 transition-smooth">
                    {integration.name.charAt(0)}
                  </div>
                  <p className="font-semibold text-sm">{integration.name}</p>
                  {integration.byok && (
                    <span className="text-xs text-muted-foreground mt-1 block">
                      BYOK optional
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <p className="text-sm text-muted-foreground">
            OAuth works everywhere by default. BYOK is optional for X/Twitter power users.
          </p>
        </div>
      </div>
    </section>
  );
};

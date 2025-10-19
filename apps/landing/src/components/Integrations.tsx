export const Integrations = () => {
  // Prefer local assets when available; fall back to Simple Icons CDN for brand logos.
  const integrations = [
    { name: "LinkedIn", oauth: true, logoSrc: "/logo/linkedin.svg" },
    { name: "X/Twitter", oauth: true, byok: true, logoSrc: "/logo/x.svg" },
    { name: "Slack", oauth: true, logoSrc: "/logo/slack.svg" },
    { name: "Notion", oauth: true, logoSrc: "/logo/notion.svg" },
    { name: "Google Calendar", oauth: true, logoSrc: "/logo/googlecalendar.svg" },
    { name: "Google Drive", oauth: true, logoSrc: "/logo/googledrive.svg" },
    { name: "Gmail", oauth: true, logoSrc: "/logo/gmail.svg" },
    { name: "HubSpot", oauth: true, logoSrc: "/logo/hubspot.svg" },
    { name: "Close CRM", oauth: true, logoSrc: "/logo/closecrm.svg" },
    { name: "Google Sheets", oauth: true, logoSrc: "/logo/googlesheets.svg" },
    { name: "Airtable", oauth: true, logoSrc: "/logo/airtable.svg" },
    { name: "QuickBooks", oauth: true, logoSrc: "/logo/quickbooks.svg" },
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
          {/* <p className="text-xl text-muted-foreground mb-12">
            Start in preview (no write). Approve to execute.
          </p> */}

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
            {integrations.map((integration, index) => (
              <div 
                key={index}
                className="gradient-card rounded-xl border border-border p-6 hover:shadow-lg hover:border-primary transition-smooth group"
                title={integration.byok ? "OAuth default; BYOK optional" : "OAuth"}
              >
                <div className="text-center">
                  <div className="w-12 h-12 mx-auto mb-3 bg-primary/10 rounded-lg flex items-center justify-center group-hover:bg-primary/20 transition-smooth">
                    {integration.logoSrc ? (
                      <img
                        src={integration.logoSrc}
                        alt={`${integration.name} logo`}
                        className="h-6 w-6"
                        width={24}
                        height={24}
                        loading="lazy"
                      />
                    ) : (
                      <span className="text-2xl font-semibold" aria-hidden>
                        {integration.name.charAt(0)}
                      </span>
                    )}
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
            OAuth works everywhere by default. BYOK is for X/Twitter, Reddit LTD Users.
          </p>
        </div>
      </div>
    </section>
  );
};

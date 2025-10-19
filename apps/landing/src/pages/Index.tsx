import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { ProblemSolution } from "@/components/ProblemSolution";
import { ThreePillars } from "@/components/ThreePillars";
import { Benefits } from "@/components/Benefits";
import { Kits } from "@/components/Kits";
import { Integrations } from "@/components/Integrations";
import { OpenSource } from "@/components/OpenSource";
import { Pricing } from "@/components/Pricing";
import { BetaSignup } from "@/components/BetaSignup";
import { SocialProof } from "@/components/SocialProof";
import { Footer } from "@/components/Footer";
import { Helmet } from "react-helmet";

const Index = () => {
  const structuredDataSoftware = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "Quik.day",
    "applicationCategory": "AutomationApplication",
    "operatingSystem": "Web",
    "description": "Execution automation for founders and lean GTM teams. Run work fast. Review only when it matters. Undo built-in.",
    "offers": {
      "@type": "AggregateOffer",
      "lowPrice": "19.00",
      "highPrice": "99.00",
      "priceCurrency": "EUR",
      "offers": [
        {"@type": "Offer", "name": "LTD", "price": "29.00", "priceCurrency": "EUR", "category": "OneTimePayments"},
        {"@type": "Offer", "name": "Starter", "price": "19.00", "priceCurrency": "EUR", "category": "Subscription"},
        {"@type": "Offer", "name": "Pro", "price": "49.00", "priceCurrency": "EUR", "category": "Subscription"},
        {"@type": "Offer", "name": "Team", "price": "99.00", "priceCurrency": "EUR", "category": "Subscription"}
      ]
    },
    "brand": {
      "@type": "Brand",
      "name": "Quik.day"
    },
    "url": "https://quik.day/",
    "softwareVersion": "beta",
    "publisher": {
      "@type": "Organization",
      "name": "Quik.day"
    }
  };

  const structuredDataFAQ = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {"@type": "Question","name": "What’s included in the Lifetime Deal?","acceptedAnswer": {"@type": "Answer","text": "The LTD includes 100 runs/month and 300 Copilot messages/month for one user and one workspace. Most solo founders never hit the cap. Add top-ups (€5) or upgrade anytime."}},
      {"@type": "Question","name": "Do chats cost extra?","acceptedAnswer": {"@type": "Answer","text": "Planning is included via Copilot messages. You’re billed (or capped on LTD) only when you execute runs."}},
      {"@type": "Question","name": "Can I bring my own API/LLM keys?","acceptedAnswer": {"@type": "Answer","text": "OAuth works everywhere by default. BYO LLM key is optional for planning; execution uses Quik’s secure connectors."}},
      {"@type": "Question","name": "What happens at the limit?","acceptedAnswer": {"@type": "Answer","text": "You can still plan; execution pauses until reset or top-up. LTD top-ups expire after 60 days."}}
    ]
  };

  const structuredDataHowTo = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    "name": "Run your first multi-channel post with Quik.day",
    "step": [
      {
        "@type": "HowToStep",
        "name": "Connect apps",
        "text": "Link LinkedIn/X, Slack, and Notion with OAuth."
      },
      {
        "@type": "HowToStep",
        "name": "Choose the kit",
        "text": "Select 'Multi-channel post' and paste your copy."
      },
      {
        "@type": "HowToStep",
        "name": "Run",
        "text": "Run now for a single post or review if bulk. Undo available for 60s."
      }
    ]
  };

  return (
    <>
      <Helmet>
        <title>Quik.day — Run work fast. Review only when it matters.</title>
        <meta 
          name="description" 
          content="Execution automation for founders and lean GTM teams. One-tap runs, review when needed, Undo built-in. Open source. Built in public." 
        />
        <link rel="canonical" href="https://quik.day/" />
        <link rel="alternate" href="https://quik.day/" hreflang="en" />
        <link rel="alternate" href="https://quik.day/" hreflang="x-default" />
        <meta name="keywords" content="automation for founders, GTM automation, workflow automation, Zapier alternative, indie hacker tools, Slack automation, CRM automation, Notion workflows, Google Calendar automation, QuickBooks automation" />
        
        {/* Open Graph */}
        <meta property="og:title" content="Quik.day — Run work fast. Review only when it matters." />
        <meta 
          property="og:description" 
          content="Automation for founders and lean GTM teams. One-tap runs, review when needed, Undo built in." 
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://quik.day/" />
        <meta property="og:image" content="https://quik.day/og.png" />
        
        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:site" content="@quikday" />
        <meta name="twitter:title" content="Quik.day — Run work fast. Review only when it matters." />
        <meta 
          name="twitter:description" 
          content="Run work fast. Review only when it matters. Undo built-in." 
        />
        <meta name="twitter:image" content="https://quik.day/og.png" />
        
        {/* Structured Data */}
        <script type="application/ld+json">
          {JSON.stringify(structuredDataSoftware)}
        </script>
        <script type="application/ld+json">
          {JSON.stringify(structuredDataFAQ)}
        </script>
        <script type="application/ld+json">
          {JSON.stringify(structuredDataHowTo)}
        </script>
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Organization",
            "name": "Quik.day",
            "url": "https://quik.day",
            "logo": "https://quik.day/logo.png",
            "sameAs": [
              "https://x.com/quikday",
              "https://github.com/hadoan/quikday"
            ],
            "contactPoint": [{
              "@type": "ContactPoint",
              "email": "hello@quik.day",
              "contactType": "customer support"
            }]
          })}
        </script>
      </Helmet>

      <div className="min-h-screen">
        <Navbar />
        <main>
          <Hero />
          <ProblemSolution />
          <ThreePillars />
          <Benefits />
          <Kits />
          <Integrations />
          <OpenSource />
          <Pricing />
          <BetaSignup />
          <SocialProof />
        </main>
        <Footer />
      </div>
    </>
  );
};

export default Index;

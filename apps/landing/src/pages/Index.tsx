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
    "description": "Execution automation for lean teams. Run work fast. Review only when it matters. Undo built-in. Open source and built in public.",
    "offers": {
      "@type": "Offer",
      "price": "19.00",
      "priceCurrency": "EUR"
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
      {
        "@type": "Question",
        "name": "Can Quik.day replace my tab juggling between Slack, CRM, email, and calendar?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes. Quik.day connects to Gmail, Slack, CRMs, QuickBooks, calendars, Notion, and more—so you can run complete workflows without switching tools."
        }
      },
      {
        "@type": "Question",
        "name": "How is Quik.day different from Zapier or Make?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Quik.day prioritizes fast execution with a simple Undo and shows a short review only for bulk or risky changes. It also uses clear per-run pricing instead of opaque credits."
        }
      },
      {
        "@type": "Question",
        "name": "Is Quik.day open source and built in public?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes. Quik.day is open source and developed in public. You can star the repo, follow the roadmap, and contribute."
        }
      },
      {
        "@type": "Question",
        "name": "Do I need my own API keys?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "No. OAuth works everywhere by default. BYOK is optional for X/Twitter power users."
        }
      }
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
          content="Quik.day connects Gmail, Slack, CRMs, QuickBooks, calendars, Notion, and more—so you stop tab-juggling and ship work faster. One-tap runs, short reviews when it counts, Undo built-in. Open source. Built in public." 
        />
        <link rel="canonical" href="https://quik.day/" />
        
        {/* Open Graph */}
        <meta property="og:title" content="Quik.day — Run work fast. Review only when it matters." />
        <meta 
          property="og:description" 
          content="Quik.day connects Gmail, Slack, CRMs, QuickBooks, calendars, Notion, and more—so you stop tab-juggling and ship work faster. One-tap runs, short reviews when it counts, Undo built-in. Open source. Built in public." 
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://quik.day/" />
        
        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Quik.day — Run work fast. Review only when it matters." />
        <meta 
          name="twitter:description" 
          content="Execution automation for lean teams. Open source. Built in public." 
        />
        
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

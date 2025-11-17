import { Link } from 'react-router-dom';

const sections = [
  {
    title: 'Information We Collect',
    items: [
      'Account data such as name, email address, organization, and authentication metadata supplied when you sign up or access Quik.day.',
      'Usage data generated when you interact with the product, including logs, device data, approximate location, and diagnostic information that helps us secure and improve the service.',
      'Workspace content (tasks, routines, attachments, automations, AI outputs) that you or your teammates submit to the platform.',
      'Payment and billing information that our PCI-compliant processors collect on our behalf when you purchase paid offerings.',
      'Information from integrations (e.g., Google, Slack, HubSpot) that you explicitly connect to Quik.day as well as publicly available or partner-provided data used to enrich your experience.',
    ],
  },
  {
    title: 'How We Use Information',
    items: [
      'Provide, operate, and personalize the Quik.day platform, including provisioning workspaces, maintaining automations, and processing your instructions.',
      'Secure the service, detect abuse, enforce policies, and monitor availability, performance, and reliability.',
      'Support you via product communications, onboarding, incident notifications, and responding to help requests.',
      'Research and develop new features—anonymizing or aggregating data whenever reasonably possible.',
      'Comply with legal obligations, audit requirements, and requests from authorities where we are legally compelled to respond.',
    ],
  },
  {
    title: 'How We Share Information',
    items: [
      'Vetted infrastructure, analytics, and communications vendors that help us run Quik.day (all bound by data processing agreements).',
      'Integration partners you authorize so that automations can read or write data on your behalf.',
      'Professional advisors (legal, compliance, auditors) under confidentiality when necessary.',
      'Law enforcement or regulators when we are legally required to do so or when disclosure is necessary to protect rights, property, or safety.',
      'In connection with a corporate transaction (merger, acquisition, financing) where the recipient must honor this Privacy Policy.',
    ],
  },
  {
    title: 'Your Choices & Rights',
    body:
      'Depending on your location, you may have rights to access, correct, download, or delete personal data, object to processing, or withdraw consent. Workspace admins manage most workspace data; we will forward requests to the appropriate controller when needed. To exercise a right, email hello@quik.day and we will respond within 30 days.',
  },
  {
    title: 'International Transfers & Retention',
    body:
      'We operate globally using U.S.-based infrastructure and reputable sub-processors. When data leaves its country of origin, we rely on Standard Contractual Clauses or equivalent safeguards. We retain personal data for as long as your account is active or as needed to provide the service, comply with law, and resolve disputes.',
  },
  {
    title: 'Security',
    body:
      'Quik.day is built with defense-in-depth: encrypted data in transit and at rest, scoped access controls, audit logging, and regular reviews. No system is perfectly secure, so we encourage enabling MFA on every integration and promptly reporting any suspected incident to security@quik.day.',
  },
  {
    title: 'Children',
    body:
      'Quik.day is not directed to children under 16 and we do not knowingly collect personal data from them. If you believe a child has provided us data, contact us and we will delete it.',
  },
  {
    title: 'Changes & Contact',
    body:
      'We may update this Privacy Policy to reflect product, legal, or operational changes. When updates are material, we will notify you via email or in-app notice. Continued use of Quik.day after changes become effective constitutes acceptance. Questions? Email hello@quik.day.',
  },
];

const PrivacyPage = () => {
  const effectiveDate = 'Effective November 17, 2025';

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="border-b border-border bg-card/40">
        <div className="container mx-auto px-6 py-16 lg:py-20">
          <div className="space-y-6 max-w-3xl">
            <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
              {effectiveDate}
            </p>
            <h1 className="text-4xl md:text-5xl font-bold">Quik.day Privacy Policy</h1>
            <p className="text-lg text-muted-foreground">
              This Privacy Policy explains how Quik.day (“we”, “us”, “our”) collects, uses, and
              shares information when you interact with our website, APIs, agents, workspaces, or
              related services. By using Quik.day, you agree to the practices described below. If
              you disagree, please refrain from using the service.
            </p>
            <div>
              <Link to="/" className="text-primary underline underline-offset-4">
                ← Back to homepage
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-6 py-16 lg:py-24 space-y-12">
        {sections.map((section) => (
          <article
            key={section.title}
            className="rounded-3xl border border-border bg-card/60 px-6 py-6 md:px-10 md:py-8 shadow-sm"
          >
            <h2 className="text-2xl font-semibold mb-4">{section.title}</h2>
            {section.body ? (
              <p className="text-muted-foreground leading-relaxed">{section.body}</p>
            ) : (
              <ul className="list-disc list-inside space-y-2 text-muted-foreground leading-relaxed">
                {section.items?.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </article>
        ))}
        <div className="text-sm text-muted-foreground">
          Need a signed DPA or sub-processor list? Reach us anytime at{' '}
          <a className="underline" href="mailto:hello@quik.day">
            hello@quik.day
          </a>
          .
        </div>
      </section>
    </main>
  );
};

export default PrivacyPage;

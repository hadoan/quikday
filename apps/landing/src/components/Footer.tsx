import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Github, Twitter } from 'lucide-react';
import { useState } from 'react';

export const Footer = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setSuccess(null);
    setError(null);

    try {
      const payload = {
        email,
        role: '',
        teamSize: '',
        useCase: 'newsletter-subscribe',
      };

      const res = await fetch('/api/beta-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Request failed with status ${res.status}`);
      }

      setSuccess("Subscribed. We'll keep you posted.");
      setEmail('');
    } catch (err: any) {
      setError(err?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  const footerLinks = {
    Product: [
      { label: 'Docs', href: '#docs' },
      { label: 'API', href: '#api' },
      { label: 'Integrations', href: '#integrations' },
      { label: 'Kits', href: '#kits' },
      { label: 'Pricing', href: '#pricing' },
    ],
    Company: [
      { label: 'About', href: '#about' },
      { label: 'Blog', href: '#blog' },
      { label: 'Changelog', href: '#changelog' },
      { label: 'Roadmap', href: '#roadmap' },
      { label: 'Community', href: '#community' },
    ],
    Legal: [
      { label: 'Privacy', href: '#privacy' },
      { label: 'Terms', href: '#terms' },
      { label: 'Security', href: '#security' },
      { label: 'OSS License', href: '#license' },
      { label: 'Contact', href: '#contact' },
    ],
  };

  return (
    <footer className="bg-card border-t border-border py-16">
      <div className="container mx-auto px-4">
        <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-8 mb-12">
          {/* Brand + Newsletter */}
          <div className="lg:col-span-2">
            <div className="flex items-center space-x-2 mb-4">
              <img
                src="/logo/logo-light-bg.svg"
                alt="Quik.day"
                className="h-8 w-8 block dark:hidden"
              />
              <img
                src="/logo/logo-dark-bg.svg"
                alt="Quik.day"
                className="h-8 w-8 hidden dark:block"
              />
              <span className="text-xl font-bold">Quik.day</span>
            </div>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm">
              Run work fast. Review only when it matters. Open source automation for lean teams.
            </p>

            {/* Newsletter */}
            <div>
              <p className="text-sm font-medium mb-3">Stay updated</p>
              <form onSubmit={handleSubscribe} className="flex flex-col sm:flex-row gap-2 max-w-md">
                <Input
                  type="email"
                  placeholder="you@company.com"
                  className="sm:max-w-xs"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <Button type="submit" variant="secondary" disabled={loading}>
                  {loading ? 'Subscribing...' : 'Subscribe'}
                </Button>
              </form>
              {success && (
                <div className="mt-3 p-3 rounded-xl bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400 text-sm">
                  {success}
                </div>
              )}
              {error && (
                <div className="mt-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-sm">
                  {error}
                </div>
              )}
            </div>
          </div>

          {/* Links */}
          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h4 className="font-bold mb-4">{category}</h4>
              <ul className="space-y-2">
                {links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-muted-foreground hover:text-foreground transition-smooth"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-border flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-muted-foreground">
            © 2025 Quik.day. Open source. Built in public.
          </p>

          <div className="flex items-center gap-4">
            <a
              href="https://twitter.com/quikday"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-smooth"
              aria-label="Twitter"
            >
              <Twitter className="h-5 w-5" />
            </a>
            <a
              href="https://github.com/hadoan/quikday"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-smooth"
              aria-label="GitHub"
            >
              <Github className="h-5 w-5" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

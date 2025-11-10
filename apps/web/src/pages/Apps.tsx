import { useMemo, useState, useEffect } from 'react';
import AppCard from '@/components/apps/AppCard';
import type { AppCardInstallProps } from '@/components/apps/AppCard';
import { Sidebar } from '@/components/layout/Sidebar';
import { ToolsPanel } from '@/components/layout/ToolsPanel';
import { UserMenu } from '@/components/layout/UserMenu';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { Button } from '@/components/ui/button';
// Removed mockRuns usage to avoid seeding mock data
import { Plug2, Search, Menu } from 'lucide-react';
import { useSidebarRuns } from '@/hooks/useSidebarRuns';
import { useKindeAuth } from '@kinde-oss/kinde-auth-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useNavigate } from 'react-router-dom';
import api from '@/apis/client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import RunDetailDrawer from '@/components/runs/RunDetailDrawer';

type AppListItem = {
  title: string;
  description: string;
  logoSrc: string;
  installProps: AppCardInstallProps;
  categories: string[];
};

const apps: AppListItem[] = [
  // {
  //   title: 'X',
  //   description:
  //     'X, formerly called Twitter, is an online social media and social networking service operated by the American company X Corp., the successor of Twitter, Inc. On X, registered users can post text, images and videos.',
  //   logoSrc: '/logo/x-social-logo.svg',
  //   installProps: {
  //     type: 'xconsumerkeys-social',
  //     slug: 'xconsumerkeys-social',
  //     variant: 'social',
  //     allowedMultipleInstalls: false,
  //   },
  //   categories: ['All', 'Social', 'X'],
  // },
  // {
  //   title: 'Linkedin',
  //   description:
  //     'LinkedIn is a business and employment-focused social media platform that works through websites and mobile apps. It was launched on May 5, 2003. Since December 2016, it has been a wholly owned subsidiary of Microsoft',
  //   logoSrc: '/logo/linkedin-social-logo.svg',
  //   installProps: {
  //     type: 'linkedin-social',
  //     slug: 'linkedin-social',
  //     variant: 'social',
  //     allowedMultipleInstalls: false,
  //   },
  //   categories: ['All', 'Social', 'LinkedIn'],
  // },
  // {
  //   title: 'Facebook Page',
  //   description:
  //     "Facebook, owned by Meta Platforms, is a popular online social media and networking service. Founded in 2004 by Mark Zuckerberg and his college roommates, it's a diverse platform enabling users to connect with loved ones, share updates, photos, videos, and explore varied content.",
  //   logoSrc: '/logo/facebook-social-logo.svg',
  //   installProps: {
  //     type: 'facebook_social',
  //     slug: 'facebook-social',
  //     variant: 'social',
  //     allowedMultipleInstalls: false,
  //   },
  //   categories: ['All', 'Social', 'Meta', 'Facebook'],
  // },
  // {
  //   title: 'Threads',
  //   description:
  //     'Threads is a text-focused social app by Meta that enables short posts and public conversations across topics. It integrates with Instagram identities and is designed for real-time discussion and community building.',
  //   logoSrc: '/logo/threads-social-logo.svg',
  //   installProps: {
  //     type: 'threads-social',
  //     slug: 'threads-social',
  //     variant: 'social',
  //     allowedMultipleInstalls: false,
  //   },
  //   categories: ['All', 'Social', 'Meta', 'Threads'],
  // },
  // {
  //   title: 'Instagram (Business)',
  //   description:
  //     'Instagram is a photo and video sharing platform from Meta that supports posts, stories, reels, and direct messaging. This integration uses the Instagram Graph API (via Facebook Login) and is intended for Business or Creator Instagram accounts that are linked to a Facebook Page.',
  //   logoSrc: '/logo/instagram-social-logo.svg',
  //   installProps: {
  //     type: 'instagram-social',
  //     slug: 'instagram-social',
  //     variant: 'social',
  //     allowedMultipleInstalls: false,
  //   },
  //   categories: ['All', 'Social', 'Meta', 'Instagram'],
  // },
  {
    title: 'Google Calendar',
    description:
      'Google Calendar helps you schedule, manage, and share events. Connect to create and update events directly from Runfast.',
    logoSrc: '/logo/googlecalendar.svg',
    installProps: {
      type: 'google-calendar',
      slug: 'google-calendar',
      variant: 'calendar',
      allowedMultipleInstalls: false,
      installMethod: 'oauth',
    },
    categories: ['All', 'Productivity', 'Calendar', 'Google'],
  },
  {
    title: 'Gmail',
    description:
      'Send and read emails using Gmail APIs with delegated access. Connect your Gmail account to send emails from Quik.day.',
    logoSrc: '/logo/gmail.svg',
    installProps: {
      type: 'gmail-email',
      slug: 'gmail-email',
      variant: 'email',
      allowedMultipleInstalls: false,
      installMethod: 'oauth',
    },
    categories: ['All', 'Productivity', 'Email', 'Google'],
  },
];

const Apps = () => {
  const [activeRunId, setActiveRunId] = useState<string | undefined>(undefined);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const { logout } = useKindeAuth();
  const handleLogout = async () => {
    try {
      const redirect = `${window.location.origin}/auth/login`;
      await logout?.(redirect);
    } catch (err) {
      console.error('Logout failed', err);
    }
  };
  const [isToolsPanelOpen, setIsToolsPanelOpen] = useState(false);
  const { runs: sidebarRuns } = useSidebarRuns(5);
  const navigate = useNavigate();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [category, setCategory] = useState<string>('All');
  const [query, setQuery] = useState('');

  // Don't auto-open drawer; open only when user selects a run

  // Collapse sidebar on small screens automatically
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const handle = () => setIsSidebarCollapsed(mq.matches);
    handle();
    mq.addEventListener('change', handle);
    return () => mq.removeEventListener('change', handle);
  }, []);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    apps.forEach((a) => {
      a.categories.forEach((c) => {
        counts.set(c, (counts.get(c) ?? 0) + 1);
      });
    });
    // Always ensure All exists and is first
    const unique = Array.from(counts.keys()).sort((a, b) => {
      if (a === 'All') return -1;
      if (b === 'All') return 1;
      return a.localeCompare(b);
    });
    return unique.map((c) => ({ name: c, count: counts.get(c) ?? 0 }));
  }, []);

  const filteredApps = useMemo(() => {
    return apps.filter((a) => {
      // Commented out category filtering so the UI shows all apps regardless of selected category.
      // const matchesCategory = category === 'All' || a.categories.includes(category);
      const matchesCategory = true;
      const q = query.trim().toLowerCase();
      const matchesQuery =
        q.length === 0 ||
        a.title.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.installProps.slug.toLowerCase().includes(q);
      return matchesCategory && matchesQuery;
    });
  }, [query]);

  // If an app install was initiated from a specific run, refresh that run's steps and return to chat
  useEffect(() => {
    let payload: any;
    try {
      const raw = localStorage.getItem(key);
      if (raw) payload = JSON.parse(raw);
    } catch {
      payload = undefined;
    }
    if (payload && payload.runId) {
      const runId = String(payload.runId);
      (async () => {
        try {
          await api.post(`/runs/${runId}/refresh-credentials`);
        } catch (e) {
          // best-effort
        } finally {
          try {
            localStorage.removeItem(key);
          } catch {}
          navigate(`/?runId=${encodeURIComponent(runId)}`);
        }
      })();
    }
  }, [navigate]);

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      <Sidebar
        runs={sidebarRuns}
        activeRunId={activeRunId}
        onSelectRun={(id) => {
          setActiveRunId(id);
          setIsDrawerOpen(true);
        }}
        collapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="border-b border-border bg-card px-3 sm:px-4 md:px-6 lg:px-8 py-3 sm:py-4 flex-shrink-0">
          <div className="flex items-center gap-2 md:gap-3">
            {/* Mobile menu button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="md:hidden h-9 w-9"
            >
              <Menu className="h-5 w-5" />
            </Button>

            <div className="flex-1 min-w-0">
              <h1 className="text-base sm:text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
                <img
                  src="/logo/logo-light-bg.svg"
                  alt="Quik.day"
                  className="h-5 sm:h-6 w-auto dark:hidden"
                />
                <img
                  src="/logo/logo-dark-bg.svg"
                  alt="Quik.day"
                  className="h-5 sm:h-6 w-auto hidden dark:block"
                />
                <span className="hidden sm:inline">Apps</span>
              </h1>
            </div>

            <div className="flex items-center gap-2">
              <ThemeToggle />
              <UserMenu
                onViewProfile={() => {}}
                onEditProfile={() => navigate('/settings/profile')}
                onLogout={handleLogout}
              />
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 md:py-8 space-y-4 sm:space-y-6">
            {/* Filter bar */}
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              {/* Tabs UI commented out — category selection temporarily disabled */}
              {/*
              <Tabs value={category} onValueChange={setCategory} className="w-full md:w-auto">
                <TabsList className="flex flex-wrap justify-start gap-1">
                  {categories.map((c) => (
                    <TabsTrigger
                      key={c.name}
                      value={c.name}
                      className="data-[state=active]:bg-primary/10"
                    >
                      <span className="mr-2">{c.name}</span>
                      <Badge variant="secondary" className="ml-auto">
                        {c.count}
                      </Badge>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              */}

              <div className="relative w-full sm:w-auto sm:min-w-[200px] md:w-64">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search apps..."
                  className="pl-9 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
              {filteredApps.map((app) => (
                <AppCard
                  key={app.installProps.slug}
                  title={app.title}
                  description={app.description}
                  logoSrc={app.logoSrc}
                  installProps={app.installProps}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <RunDetailDrawer
        runId={activeRunId}
        open={isDrawerOpen && !!activeRunId}
        onClose={() => {
          setIsDrawerOpen(false);
        }}
      />
    </div>
  );
};

export default Apps;

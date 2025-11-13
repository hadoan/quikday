import { useMemo, useState, useEffect } from 'react';
import AppCard from '@/components/apps/AppCard';
import type { AppCardInstallProps } from '@/components/apps/AppCard';
import { Sidebar } from '@/components/layout/Sidebar';
import AppHeader from '@/components/layout/AppHeader';
import { Search } from 'lucide-react';
import { useSidebarRuns } from '@/hooks/useSidebarRuns';
import { Input } from '@/components/ui/input';
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
  const { runs: sidebarRuns } = useSidebarRuns(5);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
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
        <AppHeader title="Apps" onToggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)} />

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

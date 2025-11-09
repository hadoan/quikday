import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useKindeAuth } from '@kinde-oss/kinde-auth-react';
import { listTemplates, createTemplate, type Template } from '@/apis/templates';
import { ChatBox } from '@/components/dashboard/ChatBox';
import { TemplatesGrid } from '@/components/templates/TemplatesGrid';
import { Sidebar } from '@/components/layout/Sidebar';
import { ToolsPanel } from '@/components/layout/ToolsPanel';
import { UserMenu } from '@/components/layout/UserMenu';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Plug2 } from 'lucide-react';
import { useSidebarRuns } from '@/hooks/useSidebarRuns';
import RunDetailDrawer from '@/components/runs/RunDetailDrawer';

const stripControls = (s: string) => s.replace(/[\u0000-\u001F\u007F]/g, '');

export default function DashboardPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | undefined>(undefined);
  const [isToolsPanelOpen, setIsToolsPanelOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  // Fetch latest 5 runs (same data as Runs page)
  const { runs: sidebarRuns } = useSidebarRuns(5);
  const [hasAutoSelected, setHasAutoSelected] = useState(false);
  const navigate = useNavigate();
  const { logout } = useKindeAuth();

  useEffect(() => {
    void listTemplates('en')
      .then(setTemplates)
      .catch(() => setTemplates([]));
  }, []);

  // Set default active run once on initial data load
  useEffect(() => {
    if (!hasAutoSelected && !activeRunId && sidebarRuns.length > 0) {
      setActiveRunId(sidebarRuns[0].id);
      setHasAutoSelected(true);
    }
  }, [hasAutoSelected, activeRunId, sidebarRuns.length]);

  // Auto-collapse sidebar on small screens
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const handle = () => setIsSidebarCollapsed(mq.matches);
    handle();
    mq.addEventListener('change', handle);
    return () => mq.removeEventListener('change', handle);
  }, []);

  const handleLogout = async () => {
    try {
      const redirect = `${window.location.origin}/auth/login`;
      await logout?.(redirect);
    } catch (err) {
      console.error('Logout failed', err);
    }
  };

  const prefillPush = (text: string) => {
    // Start a new chat when navigating from templates so we don't reuse an
    // existing active run. The chat page will look for `startNew` and create
    // a fresh run when present.
    const msg = stripControls(text || '').slice(0, 2000);
    navigate(`/chat?prefill=${encodeURIComponent(msg)}&startNew=1`);
  };

  const onCreateTemplate = async () => {
    const label = window.prompt('Label for template:');
    if (!label) return;
    const sample = window.prompt('Sample text:');
    if (!sample) return;
    const confirmed = window.confirm('Create this template?');
    if (!confirmed) return;
    try {
      const created = await createTemplate(
        { kind: 'custom', label: label.trim(), sample_text: sample.trim(), locale: 'en' },
        { requireConfirm: true },
      );
      setTemplates((prev) => [created, ...prev]);
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert('Failed to create template');
    }
  };

  return (
    <div className="flex h-screen w-full bg-background">
      <Sidebar
        runs={sidebarRuns}
        activeRunId={activeRunId}
        onSelectRun={setActiveRunId}
        collapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
      />

      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="border-b border-border bg-card px-4 md:px-8 py-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <img
                  src="/logo/logo-light-bg.svg"
                  alt="Quik.day"
                  className="h-6 w-auto dark:hidden"
                />
                <img
                  src="/logo/logo-dark-bg.svg"
                  alt="Quik.day"
                  className="h-6 w-auto hidden dark:block"
                />
                Dashboard
              </h1>
              <p className="text-sm text-muted-foreground mt-1">Overview and quick actions</p>
            </div>
            <div className="w-full md:w-auto flex flex-wrap items-center gap-2 md:gap-3 justify-end">
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
        <ScrollArea className="flex-1">
          <div className="max-w-4xl mx-auto px-8 py-8 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Get Started</h2>
              {/* <Button variant="outline" onClick={onCreateTemplate}>Create Template</Button> */}
            </div>

            <ChatBox onContinue={prefillPush} />

            <section className="space-y-3">
              <h2 className="text-xl font-semibold">Templates</h2>
              <TemplatesGrid templates={templates} onPrefill={(text) => prefillPush(text)} />
            </section>
          </div>
        </ScrollArea>
      </div>

      <RunDetailDrawer runId={activeRunId} open={!!activeRunId} onClose={() => setActiveRunId(undefined)} />
    </div>
  );
}

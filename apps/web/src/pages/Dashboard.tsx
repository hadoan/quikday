import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listTemplates, type Template } from '@/apis/templates';
import { ChatBox } from '@/components/dashboard/ChatBox';
import { TemplatesGrid } from '@/components/templates/TemplatesGrid';
import { Sidebar } from '@/components/layout/Sidebar';
import AppHeader from '@/components/layout/AppHeader';
import { useSidebarRuns } from '@/hooks/useSidebarRuns';
import RunDetailDrawer from '@/components/runs/RunDetailDrawer';

const stripControls = (s: string) => s.replace(/[\u0000-\u001F\u007F]/g, '');

export default function DashboardPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | undefined>(undefined);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isToolsPanelOpen, setIsToolsPanelOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  // Fetch latest 5 runs (same data as Runs page)
  const { runs: sidebarRuns } = useSidebarRuns(5);
  const navigate = useNavigate();

  useEffect(() => {
    void listTemplates('en')
      .then(setTemplates)
      .catch(() => setTemplates([]));
  }, []);

  // Don't auto-open drawer; open only when user selects a run

  // Auto-collapse sidebar on small screens
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const handle = () => setIsSidebarCollapsed(mq.matches);
    handle();
    mq.addEventListener('change', handle);
    return () => mq.removeEventListener('change', handle);
  }, []);

  const prefillPush = (text: string) => {
    // Start a new chat when navigating from templates so we don't reuse an
    // existing active run. The chat page will look for `startNew` and create
    // a fresh run when present.
    const msg = stripControls(text || '').slice(0, 2000);
    navigate(`/chat?prefill=${encodeURIComponent(msg)}&startNew=1`);
  };

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
        <AppHeader
          title="Dashboard"
          onToggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        />

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 md:py-8 space-y-4 sm:space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg sm:text-xl font-semibold">Get Started</h2>
              {/* <Button variant="outline" onClick={onCreateTemplate}>Create Template</Button> */}
            </div>

            <ChatBox onContinue={prefillPush} />

            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-semibold">Templates</h2>
              <TemplatesGrid templates={templates} onPrefill={(text) => prefillPush(text)} />
            </section>
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
}

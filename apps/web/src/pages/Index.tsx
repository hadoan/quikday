import { useState, useEffect, useRef } from 'react';
import { ChatMessage } from '@/components/chat/ChatMessage';
import { PromptInput } from '@/components/chat/PromptInput';
import { PlanCard } from '@/components/cards/PlanCard';
import { RunCard } from '@/components/cards/RunCard';
import { LogCard } from '@/components/cards/LogCard';
import { UndoCard } from '@/components/cards/UndoCard';
import { OutputCard } from '@/components/cards/OutputCard';
import { Sidebar } from '@/components/layout/Sidebar';
import { ToolsPanel } from '@/components/layout/ToolsPanel';
import { UserMenu } from '@/components/layout/UserMenu';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { mockRuns, mockTools, mockStats } from '@/data/mockRuns';
import { Plug2, Plus } from 'lucide-react';
import { getDataSource, getFeatureFlags } from '@/lib/flags/featureFlags';
import { createLogger } from '@/lib/utils/logger';
import { useToast } from '@/hooks/use-toast';
import type { UiRunSummary, UiEvent } from '@/lib/datasources/DataSource';
import { trackDataSourceActive, trackChatSent, trackRunQueued } from '@/lib/telemetry/telemetry';

const logger = createLogger('Index');

const Index = () => {
  const [runs, setRuns] = useState<UiRunSummary[]>(
    mockRuns.map((r) => ({ ...r, messages: r.messages as UiRunSummary['messages'] }))
  );
  const [activeRunId, setActiveRunId] = useState(mockRuns[0].id);
  const [isToolsPanelOpen, setIsToolsPanelOpen] = useState(true);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const activeRun = runs.find((run) => run.id === activeRunId);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Initialize data source
  const dataSource = getDataSource();
  const { toast } = useToast();

  // Connect to WebSocket for real-time updates (if live mode)
  useEffect(() => {
    if (!activeRunId) return;
    
    const flags = getFeatureFlags();
    if (flags.dataSource === 'mock') return; // Mock handles its own event simulation
    
    // Connect to live WebSocket
    const stream = dataSource.connectRunStream(activeRunId, (event: UiEvent) => {
      console.log('[Index] Received event:', event);
      
      // Update run based on event type
      setRuns((prev) =>
        prev.map((run) =>
          run.id === activeRunId
            ? { ...run, status: (event.payload.status as UiRunSummary['status']) || run.status }
            : run
        )
      );
    });
    
    return () => {
      stream.close();
    };
  }, [activeRunId, dataSource]);

  // Track data source in telemetry on mount
  useEffect(() => {
    const flags = getFeatureFlags();
    console.log('[Index] Active data source:', flags.dataSource);
    trackDataSourceActive(flags.dataSource);
  }, []);

  // Collapse sidebar on small screens automatically
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const handle = () => setIsSidebarCollapsed(mq.matches);
    handle();
    mq.addEventListener('change', handle);
    return () => mq.removeEventListener('change', handle);
  }, []);

  // Auto-scroll to bottom when messages change or switching runs
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [activeRunId, activeRun?.messages?.length]);

  const handleNewPrompt = async (prompt: string) => {
    logger.info('📨 Handling new prompt submission', {
      timestamp: new Date().toISOString(),
      activeRunId,
      prompt: prompt.substring(0, 50) + (prompt.length > 50 ? '...' : ''),
      mode: 'auto',
    });

    // Append user message locally first
    setRuns((prev) =>
      prev.map((run) =>
        run.id === activeRunId
          ? {
              ...run,
              prompt: run.prompt || prompt,
              messages: [
                ...(run.messages ?? []),
                { role: 'user' as const, content: prompt },
              ] as UiRunSummary['messages'],
            }
          : run,
      ),
    );

    try {
      logger.debug('📊 Tracking telemetry event');
      // Track chat sent event
      trackChatSent({
        mode: 'auto',
        hasSchedule: false,
        targetsCount: 0,
      });

      logger.info('🔄 Calling dataSource.createRun', {
        timestamp: new Date().toISOString(),
      });

      // Use data source to create run
      const { runId } = await dataSource.createRun({
        prompt,
        mode: 'auto',
      });

      logger.info('✅ Run created successfully', {
        runId,
        timestamp: new Date().toISOString(),
      });
      trackRunQueued(runId);

      // In live mode, WebSocket will update the UI
      // In mock mode, MockDataSource simulates events
    } catch (err) {
      logger.error('Failed to create run', err as Error);
      // Show error toast
      try {
        const message = err instanceof Error ? err.message : 'Unknown error';
        toast({
          title: 'Failed to create run',
          description: message,
          variant: 'destructive',
        });
      } catch (e) {
        // swallow - don't let toast failures break the app
        logger.error('Failed to show toast', e as Error);
      }
    }
  };

  const handleNewTask = () => {
    const newId = `R-${Date.now()}`;
    const newRun: UiRunSummary = {
      id: newId,
      prompt: '',
      timestamp: new Date().toISOString(),
      status: 'queued',
      messages: [],
    };
    setRuns((prev) => [newRun, ...prev]);
    setActiveRunId(newId);
  };

  const handleViewProfile = () => {
    console.log('View profile');
    // Navigate to profile page
  };

  const handleEditProfile = () => {
    console.log('Edit profile');
    // Navigate to edit profile page
  };

  const handleLogout = () => {
    console.log('Logout');
    // Handle logout
  };

  return (
    <div className="flex h-screen w-full bg-background">
      <Sidebar
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        runs={runs as any}
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
                One Prompt. One Run. Done.
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Conversational execution interface for founders and teams
              </p>
            </div>
            <div className="w-full md:w-auto flex flex-wrap items-center gap-2 md:gap-3 justify-end">
              <ThemeToggle />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsToolsPanelOpen(!isToolsPanelOpen)}
                className="gap-2"
              >
                <Plug2 className="h-4 w-4" />
                Integrations
              </Button>
              <Button size="sm" onClick={handleNewTask} className="gap-2">
                <Plus className="h-4 w-4" />
                New Task
              </Button>
              <UserMenu
                onViewProfile={handleViewProfile}
                onEditProfile={handleEditProfile}
                onLogout={handleLogout}
              />
            </div>
          </div>
        </header>

        {/* Chat Area */}
        <ScrollArea className="flex-1">
          <div className="max-w-4xl mx-auto px-8 py-8 space-y-6">
            {activeRun?.messages.map((message, idx) => {
              if (message.role === 'user') {
                return (
                  <ChatMessage key={idx} role="user">
                    <p className="text-sm">{message.content}</p>
                  </ChatMessage>
                );
              }

              return (
                <ChatMessage key={idx} role="assistant">
                  {message.type === 'plan' && message.data && 'intent' in message.data && (
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    <PlanCard data={message.data as any} />
                  )}
                  {message.type === 'run' && message.data && 'status' in message.data && (
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    <RunCard data={message.data as any} />
                  )}
                  {message.type === 'log' && message.data && (
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    <LogCard logs={(Array.isArray(message.data) ? message.data : (message.data as any).entries) as any} />
                  )}
                  {message.type === 'undo' && message.data && 'available' in message.data && (
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    <UndoCard data={message.data as any} />
                  )}
                  {message.type === 'output' && message.data && 'title' in message.data && (
                    <OutputCard
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      title={(message.data as any).title}
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      content={(message.data as any).content}
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      type={(message.data as any).type}
                    />
                  )}
                </ChatMessage>
              );
            })}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="border-t border-border bg-card p-6">
          <div className="max-w-4xl mx-auto">
            <PromptInput onSubmit={handleNewPrompt} />
          </div>
        </div>
      </div>

      {isToolsPanelOpen && (
        <ToolsPanel
          tools={mockTools}
          stats={mockStats}
          onClose={() => setIsToolsPanelOpen(false)}
        />
      )}
    </div>
  );
};

export default Index;

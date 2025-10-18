import { useState, useEffect } from 'react';
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
import { Zap, Plug2, Plus } from 'lucide-react';
import { getDataSource, getFeatureFlags } from '@/lib/flags/featureFlags';
import type { UiRunSummary, UiEvent } from '@/lib/datasources/DataSource';
import { trackDataSourceActive, trackChatSent, trackRunQueued } from '@/lib/telemetry/telemetry';

const Index = () => {
  const [runs, setRuns] = useState<UiRunSummary[]>(
    mockRuns.map((r) => ({ ...r, messages: r.messages as UiRunSummary['messages'] }))
  );
  const [activeRunId, setActiveRunId] = useState(mockRuns[0].id);
  const [isToolsPanelOpen, setIsToolsPanelOpen] = useState(true);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const activeRun = runs.find((run) => run.id === activeRunId);

  // Initialize data source
  const dataSource = getDataSource();

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

  const handleNewPrompt = async (prompt: string) => {
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
      // Track chat sent event
      trackChatSent({
        mode: 'auto',
        hasSchedule: false,
        targetsCount: 0,
      });

      // Use data source to create run
      const { runId } = await dataSource.createRun({
        prompt,
        mode: 'auto',
      });

      console.log('[Index] Created run:', runId);
      trackRunQueued(runId);

      // In live mode, WebSocket will update the UI
      // In mock mode, MockDataSource simulates events
    } catch (err) {
      console.error('Failed to create run:', err);
      // TODO: Show error toast
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
        <header className="border-b border-border bg-card px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <Zap className="h-6 w-6 text-primary" />
                One Prompt. One Run. Done.
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Conversational execution interface for founders and teams
              </p>
            </div>
            <div className="flex items-center gap-3">
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

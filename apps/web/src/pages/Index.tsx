import { useState } from 'react';
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

const Index = () => {
  type Run = (typeof mockRuns)[number];
  const [runs, setRuns] = useState<Run[]>(mockRuns);
  const [activeRunId, setActiveRunId] = useState(mockRuns[0].id);
  const [isToolsPanelOpen, setIsToolsPanelOpen] = useState(true);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const activeRun = runs.find((run) => run.id === activeRunId);

  const API_BASE =
    (import.meta as any).env?.VITE_API_BASE_URL ||
    (typeof window !== 'undefined'
      ? `${window.location.protocol}//${window.location.hostname}:3000`
      : 'http://localhost:3000');

  const handleNewPrompt = async (prompt: string) => {
    // Append user message locally first
    setRuns((prev) =>
      prev.map((run) =>
        run.id === activeRunId
          ? {
              ...run,
              prompt: run.prompt || prompt,
              messages: [...(run.messages ?? []), { role: 'user' as const, content: prompt }],
            }
          : run,
      ),
    );

    try {
      const res = await fetch(`${API_BASE}/chat/agent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer dev',
        },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      const outputs: string[] = Array.isArray(data?.messages) ? data.messages : [];

      if (outputs.length) {
        setRuns((prev) =>
          prev.map((run) =>
            run.id === activeRunId
              ? {
                  ...run,
                  messages: [
                    ...(run.messages ?? []),
                    ...outputs.map((text) => ({
                      role: 'assistant' as const,
                      type: 'output' as const,
                      data: { title: 'Assistant', content: text, type: 'text' as const },
                    })),
                  ],
                }
              : run,
          ),
        );
      }
    } catch (err) {
      console.error('Agent error', err);
    }
  };

  const handleNewTask = () => {
    const newId = `R-${Date.now()}`;
    const newRun: Run = {
      id: newId,
      prompt: '',
      timestamp: new Date().toISOString(),
      status: 'running' as const,
      messages: [] as any[],
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
        runs={runs}
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
                  {message.type === 'plan' && <PlanCard data={message.data} />}
                  {message.type === 'run' && <RunCard data={message.data} />}
                  {message.type === 'log' && <LogCard logs={message.data} />}
                  {message.type === 'undo' && <UndoCard data={message.data} />}
                  {message.type === 'output' && (
                    <OutputCard
                      title={message.data.title}
                      content={message.data.content}
                      type={message.data.type}
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

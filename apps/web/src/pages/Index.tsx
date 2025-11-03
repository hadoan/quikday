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
import { Plug2, Plus, Loader2 } from 'lucide-react';
import { useKindeAuth } from '@kinde-oss/kinde-auth-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getDataSource, getFeatureFlags } from '@/lib/flags/featureFlags';
import {
  buildPlanMessage,
  buildRunMessage,
  buildLogMessage,
  buildOutputMessage,
  buildUndoMessage,
} from '@/lib/adapters/backendToViewModel';
import ChatStream from '@/components/chat/ChatStream';
import QuestionsPanel, { type Question } from '@/components/QuestionsPanel';
import { createLogger } from '@/lib/utils/logger';
import { useToast } from '@/hooks/use-toast';
import type { UiRunSummary, UiEvent } from '@/lib/datasources/DataSource';
import { trackDataSourceActive, trackChatSent, trackRunQueued } from '@/lib/telemetry/telemetry';
import api from '@/apis/client';

const logger = createLogger('Index');

const Index = () => {
  const [runs, setRuns] = useState<UiRunSummary[]>(
    mockRuns.map((r) => ({ ...r, messages: r.messages as UiRunSummary['messages'] })),
  );
  const [activeRunId, setActiveRunId] = useState(mockRuns[0].id);
  const [isToolsPanelOpen, setIsToolsPanelOpen] = useState(true);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const activeRun = runs.find((run) => run.id === activeRunId);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const [prefill, setPrefill] = useState<string | undefined>(undefined);

  // Initialize data source
  const dataSource = getDataSource();
  const { toast } = useToast();

  // Handle pending install return-to-run if present
  useEffect(() => {
    const key = 'qd.pendingInstall';
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
          // ignore
        } finally {
          try {
            localStorage.removeItem(key);
          } catch {}
        }
      })();
    }
  }, []);

  // Connect to WebSocket for real-time updates (if live mode)
  useEffect(() => {
    if (!activeRunId) return;

    // Connect to stream for both live and mock; MockDataSource simulates events
    const stream = dataSource.connectRunStream(activeRunId, (event: UiEvent) => {
      console.log('[Index] Received event:', event);

      // If we receive an event for a run that the UI doesn't yet know about,
      // create a minimal run entry and activate it so incoming events are visible.
      // This covers cases where runs are created outside the UI (CLI, API clients)
      // and the frontend wasn't aware of the new run id.
      try {
        const incomingRunId = event.runId;
        if (incomingRunId) {
          setRuns((prev) => {
            const exists = prev.find((r) => r.id === incomingRunId);
            if (exists) return prev;
            const minimal = {
              id: incomingRunId,
              prompt: '',
              timestamp: new Date().toISOString(),
              status: 'running' as const,
              messages: [],
            } as any;
            return [minimal, ...prev];
          });

          setActiveRunId((cur) => cur || (event.runId as string));
        }
      } catch (e) {
        // don't let debugging code break the stream handler
        console.warn('[Index] Failed to auto-add incoming run', e);
      }

      // Extract planner questions if present (plan_generated or planner node exit)
      try {
        // Questions may be in payload.diff.questions (plan_generated)
        const planQs = (event.payload as any)?.diff?.questions as any[] | undefined;
        if (
          event.runId &&
          event.runId === activeRunId &&
          Array.isArray(planQs) &&
          planQs.length > 0
        ) {
          setQuestions(planQs as any);
        }

        // Or nested in node.exit delta -> output.diff.questions
        const raw = (event.payload as any)?._raw as any;
        const node = raw?.payload?.node as string | undefined;
        const nestedQs = raw?.payload?.delta?.output?.diff?.questions as any[] | undefined;
        if (
          event.runId &&
          event.runId === activeRunId &&
          node === 'planner' &&
          Array.isArray(nestedQs) &&
          nestedQs.length > 0
        ) {
          setQuestions(nestedQs as any);
        }
      } catch (qErr) {
        // ignore
      }

      // Hide loading spinner when we receive any message from backend
      if (event.type !== 'connection_established') {
        setIsWaitingForResponse(false);
      }

      setRuns((prev) =>
        prev.map((run) => {
          if (run.id !== activeRunId) return run;

          // Update status if provided
          const nextStatus = (event.payload.status as UiRunSummary['status']) || run.status;

          // Translate common events into chat messages
          const newMessages = [...(run.messages ?? [])];
          switch (event.type) {
            case 'connection_established': {
              // Just log connection, don't show a card
              console.log('[Index] WebSocket connected:', event.payload.message);
              break;
            }
            case 'plan_generated': {
              const intent = (event.payload.intent as string) || 'Process request';
              const tools = (event.payload.tools as string[]) || [];
              const actions = (event.payload.actions as string[]) || [];
              const stepsPayload =
                (Array.isArray(event.payload.steps) && (event.payload.steps as any[])) ||
                (Array.isArray(event.payload.plan) && (event.payload.plan as any[])) ||
                [];

              // Skip plan and proposed changes cards if only chat.respond
              const onlyChatRespond = 
                stepsPayload.length > 0 && 
                stepsPayload.every((step: any) => step?.tool === 'chat.respond');

              if (!onlyChatRespond) {
                // Show Proposed Changes card first, then Plan card
                const diff = event.payload.diff as Record<string, unknown> | undefined;
                if (diff && Object.keys(diff).length > 0) {
                  try {
                    newMessages.push(
                      buildOutputMessage({
                        title: 'Proposed Changes',
                        content: JSON.stringify(diff, null, 2),
                        type: 'json',
                        data: diff,
                      }),
                    );
                  } catch (e) {
                    console.warn('[Index] Failed to render diff preview', e);
                  }
                }

                newMessages.push(
                  buildPlanMessage({
                    intent,
                    tools,
                    actions,
                    steps: stepsPayload as any,
                  }),
                );
              }
              break;
            }
            case 'run_snapshot': {
              // Snapshot includes status and lastAssistant for quick UI hydration
              try {
                const status = (event.payload.status as UiRunSummary['status']) || run.status;
                const lastAssistant = event.payload.lastAssistant as string | undefined;
                if (lastAssistant && typeof lastAssistant === 'string' && lastAssistant.trim()) {
                  newMessages.push({ role: 'assistant', content: lastAssistant });
                }
                // Update run status via nextStatus below
                // fallthrough handled by run_status processing after switch
              } catch (e) {
                console.warn('[Index] Failed to handle run_snapshot', e);
              }
              break;
            }
            case 'step_started': {
              // Show step starting (optional - could show loading state)
              console.log('[Index] Step started:', event.payload.tool, event.payload.action);
              break;
            }
            case 'run_status':
            case 'scheduled':
            case 'run_completed': {
              console.log('[Index] 📊 Status event received:', {
                type: event.type,
                status: event.payload.status,
                timestamp: new Date().toISOString(),
              });
              
              const status =
                (event.type === 'run_completed' ? 'succeeded' : (event.payload.status as string)) ||
                'queued';
              const started_at =
                (event.payload.started_at as string | undefined) ||
                (event.payload.startedAt as string | undefined) ||
                (event.ts as string | undefined);
              const completed_at =
                (event.payload.completed_at as string | undefined) ||
                (event.payload.completedAt as string | undefined);

              // Find last RunCard that is still "running" or "queued" (not completed)
              let lastRunningCardIndex = -1;
              for (let i = newMessages.length - 1; i >= 0; i--) {
                const msg = newMessages[i];
                if (msg && msg.role === 'assistant' && msg.type === 'run' && msg.data) {
                  const cardStatus = (msg.data as any).status;
                  // Only update if card is in active state (running, queued, executing)
                  if (cardStatus && !['succeeded', 'failed', 'partial'].includes(cardStatus)) {
                    lastRunningCardIndex = i;
                    break;
                  }
                }
              }

              if (lastRunningCardIndex !== -1) {
                // Update existing active RunCard
                const oldStatus = (newMessages[lastRunningCardIndex]?.data as any)?.status;
                console.log(
                  '[Index] Updating active RunCard at index',
                  lastRunningCardIndex,
                  'from status:',
                  oldStatus,
                  'to status:',
                  status,
                );
                newMessages[lastRunningCardIndex] = buildRunMessage({
                  status,
                  started_at,
                  completed_at,
                });
                console.log('[Index] After update, message status is:', (newMessages[lastRunningCardIndex]?.data as any)?.status);
              } else {
                // No active RunCard, create a new one (new run starting)
                console.log('[Index] Creating new RunCard with status:', status);
                newMessages.push(
                  buildRunMessage({
                    status,
                    started_at,
                    completed_at,
                  }),
                );
              }

              // If backend provides structured output or summary, show it alongside plain text
              // Handle awaiting_input specially: persist questions to the active run and
              // surface the QuestionsPanel (which posts answers + confirm). We also set
              // the run status to 'awaiting_input' so UI components can react.
              try {
                const payload = event.payload as Record<string, unknown>;
                // If awaiting_approval mid-execution and backend included step details, surface a plan card
                if (
                  status === 'awaiting_approval' &&
                  Array.isArray((payload as any)?.steps) &&
                  (payload as any).steps.length > 0
                ) {
                  const stepsPayload = (payload as any).steps as any[];
                  // Show an approval card even if a regular plan card already exists.
                  // If an approval-mode plan already exists, update it; otherwise append a new one.
                  let approvalPlanIndex = -1;
                  for (let i = newMessages.length - 1; i >= 0; i--) {
                    const msg = newMessages[i];
                    if (msg && msg.type === 'plan' && (msg.data as any)?.mode === 'approval') {
                      approvalPlanIndex = i;
                      break;
                    }
                  }

                  const approvalPlan = buildPlanMessage({
                    intent: 'Review pending actions',
                    tools: stepsPayload.map((s: any) => s.tool).filter(Boolean),
                    actions: stepsPayload.map((s: any) => s.action || `Execute ${s.tool}`),
                    steps: stepsPayload as any,
                    awaitingApproval: true,
                    mode: 'approval',
                  });

                  if (approvalPlanIndex >= 0) {
                    newMessages[approvalPlanIndex] = approvalPlan;
                  } else {
                    newMessages.push(approvalPlan);
                  }
                }
              
                if (
                  (payload?.status as string) === 'awaiting_input' &&
                  Array.isArray(payload?.questions) &&
                  event.runId === activeRunId
                ) {
                  const qs = (payload.questions as any[]) || [];
                  // Save questions to the active run object so UI can render them inline
                  setRuns((prevRuns) =>
                    prevRuns.map((r) =>
                      r.id === activeRunId
                        ? { ...r, status: 'awaiting_input', awaitingQuestions: qs }
                        : r,
                    ),
                  );

                  // Also set the local questions state (used by QuestionsPanel currently)
                  setQuestions(qs as any);
                }
              } catch (e) {
                // ignore
              }
              try {
                const payload = event.payload as Record<string, unknown>;
                const output = (payload?.output as any) || {};

                const textOut =
                  (typeof output === 'object' &&
                    (output.message || output.text || output.content)) ||
                  (payload?.finalMessage as string) ||
                  (payload?.message as string) ||
                  (payload?.text as string);

                if (typeof textOut === 'string' && textOut.trim().length > 0) {
                  newMessages.push({ role: 'assistant', content: textOut });
                }

                // Also respect run-level lastAssistant (convenience field from the backend)
                const lastAssistant = (event.payload as any)?.lastAssistant as string | undefined;
                if (typeof lastAssistant === 'string' && lastAssistant.trim().length > 0) {
                  const last = newMessages[newMessages.length - 1];
                  if (!(last && last.role === 'assistant' && last.content === lastAssistant)) {
                    newMessages.push({ role: 'assistant', content: lastAssistant });
                  }
                }

                if (event.type === 'run_completed') {
                  if (typeof output?.summary === 'string' && output.summary.trim().length > 0) {
                    newMessages.push(
                      buildOutputMessage({
                        title: 'Summary',
                        content: output.summary,
                        type: 'summary',
                        data: output,
                      }),
                    );
                  }

                  if (Array.isArray(output?.undo) && output.undo.length > 0) {
                    newMessages.push(buildUndoMessage(true));
                  }
                }

                if (
                  (event.type === 'run_status' || event.type === 'run_completed') &&
                  (event.payload.reason || event.payload.details)
                ) {
                  const reason = String(event.payload.reason || 'policy');
                  try {
                    newMessages.push(
                      buildOutputMessage({
                        title: 'Run halted',
                        content: `Reason: ${reason}`,
                        type: 'text',
                        data: event.payload,
                      }),
                    );
                  } catch (haltErr) {
                    console.warn('[Index] Failed to render fallback reason', haltErr);
                  }
                }
              } catch (e) {
                console.warn('[Index] Failed to extract plain output message from payload', e);
              }
              break;
            }
            case 'step_succeeded':
            case 'step_output': {
              // Try to build a single-step log entry if provided
              const entry = {
                tool: (event.payload.tool as string) || 'unknown',
                action: (event.payload.action as string) || 'Executed',
                status: 'succeeded',
                request: event.payload.request,
                response: event.payload.response,
                startedAt: (event.payload.startedAt as string) || (event.payload.ts as string),
                completedAt: (event.payload.completedAt as string) || (event.payload.ts as string),
              };
              newMessages.push(buildLogMessage([entry] as any));

              // Also render plain text output if provided in the event
              try {
                const payload = event.payload as Record<string, unknown>;
                const output = (payload?.output as any) || {};
                const textOut =
                  (typeof output === 'object' &&
                    (output.message || output.text || output.content)) ||
                  (payload?.message as string) ||
                  (payload?.text as string);
                if (typeof textOut === 'string' && textOut.trim().length > 0) {
                  newMessages.push({ role: 'assistant', content: textOut });
                }
              } catch (e) {
                console.warn('[Index] Failed to extract step text output from payload', e);
              }
              break;
            }
            case 'assistant.final':
            case 'assistant.delta': {
              try {
                const payloadRec = event.payload as Record<string, unknown>;
                const resp = payloadRec?.response as unknown as Record<string, unknown> | undefined;
                const text =
                  (payloadRec?.text as string) ||
                  (payloadRec?.message as string) ||
                  (resp?.message as string) ||
                  '';
                if (typeof text === 'string' && text.trim().length > 0) {
                  const last = newMessages[newMessages.length - 1];
                  if (!(last && last.role === 'assistant' && last.content === text)) {
                    newMessages.push({ role: 'assistant', content: text });
                  }
                }
              } catch (e) {
                console.warn('[Index] Failed to handle assistant event', e);
              }
              break;
            }
            case 'step_failed': {
              const entry = {
                tool: (event.payload.tool as string) || 'unknown',
                action: (event.payload.action as string) || 'Failed',
                status: 'failed',
                errorCode: (event.payload.errorCode as string) || 'E_STEP_FAILED',
                errorMessage: (event.payload.message as string) || 'Step failed',
                startedAt: (event.payload.startedAt as string) || (event.payload.ts as string),
                completedAt: (event.payload.completedAt as string) || (event.payload.ts as string),
              };
              newMessages.push(buildLogMessage([entry] as any));
              break;
            }
            default:
              break;
          }

          return { ...run, status: nextStatus, messages: newMessages };
        }),
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

  // Read ?prefill= from URL and sanitize (input placeholder only)
  useEffect(() => {
    try {
      const sp = new URLSearchParams(location.search);
      const raw = sp.get('prefill') || '';
      if (raw) {
        const stripped = raw.replace(/[\u0000-\u001F\u007F]/g, '');
        const trimmed = stripped.slice(0, 2000);
        setPrefill(trimmed);
      } else {
        setPrefill(undefined);
      }
    } catch {
      setPrefill(undefined);
    }
  }, [location.search]);

  const handleNewPrompt = async (prompt: string, mode: 'preview' | 'approval' | 'auto' = 'preview') => {
    logger.info('📨 Handling new prompt submission', {
      timestamp: new Date().toISOString(),
      activeRunId,
      prompt: prompt.substring(0, 50) + (prompt.length > 50 ? '...' : ''),
      mode,
    });

    const conversationalHistory: { role: 'user' | 'assistant'; content: string }[] = [];
    if (activeRun?.messages?.length) {
      for (const message of activeRun.messages) {
        if (message.role === 'user' && typeof message.content === 'string') {
          conversationalHistory.push({ role: 'user', content: message.content });
        }
        if (message.role === 'assistant' && typeof message.content === 'string') {
          conversationalHistory.push({ role: 'assistant', content: message.content });
        }
      }
    }

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

    // Show loading spinner
    setIsWaitingForResponse(true);

    try {
      logger.debug('📊 Tracking telemetry event');
      // Track chat sent event
      trackChatSent({
        mode,
        hasSchedule: false,
        targetsCount: 0,
      });

      logger.info('🔄 Calling dataSource.createRun', {
        timestamp: new Date().toISOString(),
        mode,
      });

      // Use data source to create run
      const { runId } = await dataSource.createRun({
        prompt,
        mode,
        messages: [...conversationalHistory, { role: 'user', content: prompt }],
      });

      logger.info('✅ Run created successfully', {
        runId,
        mode,
        timestamp: new Date().toISOString(),
      });
      trackRunQueued(runId);

      // In live mode, WebSocket will update the UI
      // In mock mode, MockDataSource simulates events
      // Switch active run to the backend runId and keep the user's message
      setRuns((prev) =>
        prev.map((run) => (run.id === activeRunId ? { ...run, id: runId, status: 'queued' } : run)),
      );
      setActiveRunId(runId);
    } catch (err) {
      logger.error('Failed to create run', err as Error);
      // Hide loading spinner on error
      setIsWaitingForResponse(false);
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

  // No autosend; when navigated with ?prefill, show in chatbox only.

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
    // Clear any outstanding questions when starting a fresh run
    setQuestions([]);
    // Hide loading spinner when starting new task
    setIsWaitingForResponse(false);
  };

  const handleViewProfile = () => {
    console.log('View profile');
    // Navigate to profile page
  };

  const handleEditProfile = () => {
    navigate('/settings/profile');
  };

  const { logout } = useKindeAuth();
  const handleLogout = async () => {
    try {
      const redirect = `${window.location.origin}/auth/login`;
      await logout?.(redirect);
    } catch (err) {
      console.error('Logout failed', err);
    }
  };

  const handleSelectRun = (runId: string) => {
    setActiveRunId(runId);
    // Hide loading spinner when switching runs
    setIsWaitingForResponse(false);
  };

  return (
    <div className="flex h-screen w-full bg-background">
      <Sidebar
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        runs={runs as any}
        activeRunId={activeRunId}
        onSelectRun={handleSelectRun}
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
            {!activeRun && (
              <div className="text-center text-muted-foreground py-8">No active run selected</div>
            )}
            {activeRun && (!activeRun.messages || activeRun.messages.length === 0) && (
              <div className="text-center text-muted-foreground py-8">No messages yet</div>
            )}
            <ChatStream runId={activeRunId} messages={activeRun?.messages ?? []} />
            {/** Loading spinner while waiting for backend response */}
            {isWaitingForResponse && (
              <div className="flex items-center gap-3 text-muted-foreground animate-fade-in">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Processing your request...</span>
              </div>
            )}
            {/** Questions panel (planner missing-info) */}
            {questions.length > 0 && (
              <QuestionsPanel
                runId={activeRunId}
                questions={questions}
                onSubmitted={() => setQuestions([])}
              />
            )}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="border-t border-border bg-card p-6">
          <div className="max-w-4xl mx-auto">
            <PromptInput onSubmit={handleNewPrompt} initialValue={prefill} />
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

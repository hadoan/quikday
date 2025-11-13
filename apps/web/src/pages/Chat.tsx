import { useEffect } from 'react';
import { PromptInput } from '@/components/chat/PromptInput';
import { Sidebar } from '@/components/layout/Sidebar';
import { Loader2 } from 'lucide-react';
import { useSidebarRuns } from '@/hooks/useSidebarRuns';
import { useLocation, useNavigate } from 'react-router-dom';
import { getDataSource, getFeatureFlags } from '@/lib/flags/featureFlags';
import ChatStream from '@/components/chat/ChatStream';
import RunDetailDrawer from '@/components/runs/RunDetailDrawer';
import { createLogger } from '@/lib/utils/logger';
import { useToast } from '@/hooks/use-toast';
import type { UiRunSummary } from '@/apis/runs';
import { trackDataSourceActive } from '@/lib/telemetry/telemetry';
import { useNavigationWarning } from '@/hooks/useNavigationWarning';
import { useChatState } from '@/hooks/useChatState';
import { useRunActions } from '@/hooks/useRunActions';
import { useWebSocketEvents } from '@/hooks/useWebSocketEvents';
import ChatHeader from '@/components/chat/ChatHeader';

// Initialize data source at the top to avoid ReferenceError
const dataSource = getDataSource();

const Chat = () => {
  // Use custom hooks for state management
  const state = useChatState();
  const {
    runs,
    setRuns,
    activeRunId,
    setActiveRunId,
    activeRun,
    isSidebarCollapsed,
    setIsSidebarCollapsed,
    setQuestions,
    setSteps,
    isWaitingForResponse,
    setIsWaitingForResponse,
    drawerRunId,
    setDrawerRunId,
    prefill,
    setPrefill,
    bottomRef,
    draftIdRef,
    skipAutoSelectRef,
  } = state;

  const { runs: sidebarRuns } = useSidebarRuns(5);
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  // Use run actions hook
  const runActions = useRunActions({
    activeRunId,
    activeRun,
    setRuns,
    setActiveRunId,
    setQuestions,
    setIsWaitingForResponse,
    setPrefill,
    toast,
  });

  const { handleNewPrompt, handleNewTask, ensureDraftForTyping } = runActions;

  // Merge server-provided sidebar runs with any local draft/unknown runs so
  // that a new chat appears in the sidebar as soon as the user starts typing.
  const sidebarMerged = (() => {
    try {
      const server = sidebarRuns || [];
      const serverIds = new Set(server.map((r) => r.id));
      const localExtras = runs
        .filter((r) => !serverIds.has(r.id))
        .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))
        .map((r) => ({
          id: r.id,
          prompt: r.prompt || '',
          timestamp: r.timestamp || new Date().toISOString(),
          status:
            r.status === 'succeeded' || r.status === 'completed' || r.status === 'done'
              ? ('completed' as const)
              : r.status === 'failed'
                ? ('failed' as const)
                : ('running' as const),
        }));
      // Prepend local extras, then server items; de-duplicate by id
      const combined = [] as typeof server;
      const seen = new Set<string>();
      for (const item of [...localExtras, ...server]) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        combined.push(item);
      }
      return combined;
    } catch {
      return sidebarRuns;
    }
  })();

  // Handle direct run_id parameter (e.g., /chat?run_id=xxx)
  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    const runIdParam = sp.get('run_id');

    // Only process if we have a run_id and it's not already the active run
    if (runIdParam && runIdParam !== activeRunId) {
      console.log('[Chat] Direct run_id parameter detected:', runIdParam);

      // Skip if this is a temporary client-generated ID
      if (/^R-\d+$/.test(runIdParam)) {
        console.log('[Chat] Skipping temporary runId:', runIdParam);
        navigate('/chat', { replace: true });
        return;
      }

      (async () => {
        try {
          // Fetch the run data with credential update to get latest credential state
          // This is especially important when returning from credential installation
          const { run, steps: runSteps } = await dataSource.getRun(runIdParam);

          // Update hasMissingCredentials flag in messages based on current steps
          // This is crucial after credential installation - the backend may return old chat items
          // with hasMissingCredentials: true, but the steps now have valid credentialId values
          console.log('[Chat] Run messages from backend:', {
            runId: runIdParam,
            messageCount: run.messages?.length,
            messages: run.messages,
            runSteps,
          });

          if (run.messages && Array.isArray(runSteps)) {
            const currentHasMissingCredentials = runSteps.some(
              (step) =>
                step.appId && (step.credentialId === null || step.credentialId === undefined),
            );
            console.log('[Chat] Current credential state:', {
              currentHasMissingCredentials,
              stepsWithMissingCreds: runSteps.filter(
                (s) => s.appId && (s.credentialId === null || s.credentialId === undefined),
              ),
            });

            run.messages = run.messages
              .map((msg) => {
                // Update questions message
                if (msg.type === 'questions' && msg.data) {
                  console.log('[Chat] BEFORE update - questions message:', {
                    type: msg.type,
                    data: msg.data,
                  });

                  // Safely access properties while preserving the questions array
                  const questionData = msg.data as Record<string, unknown>;
                  const updatedData = {
                    runId: questionData.runId as string | undefined,
                    questions: (questionData.questions as unknown[]) || [], // Explicitly preserve questions array
                    steps: runSteps, // Update steps with current credential info
                    hasMissingCredentials: currentHasMissingCredentials, // Update credential state
                  };

                  console.log('[Chat] AFTER update - questions message:', {
                    type: msg.type,
                    data: updatedData,
                    questionsCount: updatedData.questions.length,
                  });

                  return {
                    ...msg,
                    data: updatedData,
                  };
                }
                // Update app_credentials message (remove it if credentials are now installed)
                if (msg.type === 'app_credentials' && currentHasMissingCredentials === false) {
                  console.log(
                    '[Chat] Removing app_credentials message (credentials now installed)',
                  );
                  return null;
                }
                return msg;
              })
              .filter((msg): msg is typeof msg & object => msg !== null);

            console.log('[Chat] Final messages after update:', {
              messageCount: run.messages.length,
              messages: run.messages,
            });
          }

          // Add to runs array if not already present
          setRuns((prev) => {
            const existing = prev.find((r) => r.id === runIdParam);
            if (existing) {
              // Update existing run with full data
              return prev.map((r) => (r.id === runIdParam ? { ...r, ...run } : r));
            } else {
              // Add new run
              return [run, ...prev];
            }
          });

          // Store steps data for QuestionsPanel
          if (Array.isArray(runSteps)) {
            setSteps(runSteps);
          }

          // Set as active run
          setActiveRunId(runIdParam);

          console.log('[Chat] Successfully loaded run:', runIdParam, 'with steps:', runSteps);
        } catch (error) {
          console.error('[Chat] Failed to load run from run_id:', error);
          toast({
            title: 'Failed to load run',
            description: 'The requested run could not be found or loaded.',
            variant: 'destructive',
          });
          // Clean up URL on error
          navigate('/chat', { replace: true });
        }
      })();
    }
  }, [location.search, activeRunId, dataSource, navigate, toast]);

  // Default to the most recent run if none selected,
  // unless a startNew query param is present (which triggers a fresh run).
  useEffect(() => {
    try {
      const sp = new URLSearchParams(location.search);
      const v = sp.get('startNew') || sp.get('startnew');
      if (v === '1' || v === 'true') return;
    } catch {}

    // Skip auto-selection if we just came from app install
    if (skipAutoSelectRef.current) return;

    if (!activeRunId && sidebarRuns.length > 0) setActiveRunId(sidebarRuns[0].id);
  }, [activeRunId, sidebarRuns.length, location.search]);

  // Determine if navigation should be blocked based on active run state
  // Don't block on 'planning', 'awaiting_input', or 'pending_apps_install'
  // since user may need to install apps via OAuth (which navigates away)
  const hasActiveWork = Boolean(
    activeRun &&
      (activeRun.status === 'executing' ||
        activeRun.status === 'scheduled' ||
        activeRun.status === 'awaiting_approval' ||
        isWaitingForResponse),
  );

  // Navigation warning dialog when user tries to leave with active work
  const navigationWarningDialog = useNavigationWarning({
    shouldBlock: hasActiveWork,
    title: 'Leave Active Task?',
    message:
      'You have an active task in progress. If you navigate away now, any unsaved work and execution state will be lost and cannot be recovered. Are you sure you want to leave?',
  });

  // Ensure selecting a sidebar run loads its details if not present locally
  // or if we only have a minimal stub without messages yet.
  useEffect(() => {
    if (!activeRunId) return;

    // Don't fetch temporary client-generated IDs (e.g., R-1234567890)
    if (/^R-\d+$/.test(activeRunId)) {
      console.log('[Chat] Skipping fetch for temporary runId:', activeRunId);
      return;
    }

    const existing = runs.find((r) => r.id === activeRunId);
    const hasMessages = Array.isArray(existing?.messages) && existing!.messages!.length > 0;
    if (existing && hasMessages) return;

    (async () => {
      try {
        const { run } = await dataSource.getRun(activeRunId);
        setRuns((prev) => {
          const idx = prev.findIndex((r) => r.id === activeRunId);
          if (idx === -1) return [run, ...prev];
          const next = [...prev];
          next[idx] = { ...next[idx], ...run, messages: run.messages } as UiRunSummary;
          return next;
        });
      } catch (e) {
        // best-effort; real-time stream may still populate
      }
    })();
  }, [activeRunId, runs]);

  // Connect to WebSocket for real-time updates using dedicated hook
  useWebSocketEvents({
    dataSource,
    activeRunId,
    setRuns,
    setActiveRunId,
    setQuestions,
    setIsWaitingForResponse,
  });

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

  // Called once on the very first keystroke to decide whether to create a new draft run
  const handleStartTypingOnce = () => {
    if (draftIdRef.current) return; // already initialized
    const ar = runs.find((r) => r.id === activeRunId);
    const hasHistory = !!ar && Array.isArray(ar.messages) && (ar.messages?.length ?? 0) > 0;
    if (!activeRunId || hasHistory) {
      const newId = handleNewTask();
      draftIdRef.current = newId;
    } else {
      // Reuse existing empty run
      draftIdRef.current = activeRunId;
    }
  };

  // If navigated with ?startNew=1 (from Dashboard template 'Try this'), start a
  // fresh run so we don't reuse an existing active run. We also strip the
  // query param from the URL afterwards to avoid re-creating on reload.
  useEffect(() => {
    try {
      const sp = new URLSearchParams(location.search);
      const v = sp.get('startNew') || sp.get('startnew');
      if (v === '1' || v === 'true') {
        console.log('[Chat] startNew detected, creating fresh task');

        // Create completely new task with empty state
        handleNewTask();

        // Reset the skip flag after creating new task
        skipAutoSelectRef.current = false;

        // Remove the param so refresh doesn't recreate
        const url = new URL(window.location.href);
        url.searchParams.delete('startNew');
        url.searchParams.delete('startnew');
        window.history.replaceState({}, '', url.toString());
      }
    } catch (e) {
      // ignore
    }
  }, [location.search]);

  const handleSelectRun = (runId: string) => {
    // In Chat screen, clicking a run shows details drawer instead of switching chat
    setDrawerRunId(runId);
  };

  return (
    <>
      {/* Navigation warning dialog */}
      {navigationWarningDialog}

      <div className="flex h-screen w-full bg-background overflow-hidden">
        <Sidebar
          runs={sidebarMerged}
          activeRunId={activeRunId}
          onSelectRun={handleSelectRun}
          collapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        />

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <ChatHeader
            isSidebarCollapsed={isSidebarCollapsed}
            onToggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            onNewTask={handleNewTask}
          />

          {/* Chat Area */}
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-4xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 md:py-8 space-y-4 sm:space-y-6">
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
              {/** Render QuestionsPanel when awaiting input and run_id is in URL params */}
              {/* {(() => {
                const sp = new URLSearchParams(location.search);
                const hasRunIdParam = sp.has('run_id');
                const isAwaitingInput = activeRun?.status === 'awaiting_input';
                const hasQuestions = questions.length > 0;

                return hasRunIdParam && isAwaitingInput && hasQuestions && activeRunId ? (
                  <QuestionsPanel
                    runId={activeRunId}
                    questions={questions}
                    steps={steps}
                    onSubmitted={() => {
                      // Clear questions after submission
                      setQuestions([]);
                      // The WebSocket will update the run status
                    }}
                  />
                ) : null;
              })()} */}
              <div ref={bottomRef} />
            </div>
          </div>

          {/* Input Area */}
          <div className="border-t border-border bg-card p-3 sm:p-4 md:p-6 flex-shrink-0">
            <div className="max-w-4xl mx-auto">
              <PromptInput
                onSubmit={handleNewPrompt}
                initialValue={prefill}
                autoFocus
                onChangeText={ensureDraftForTyping}
                onStartTyping={handleStartTypingOnce}
              />
            </div>
          </div>
        </div>

        {/* Run details drawer (like Runs screen) */}
        <RunDetailDrawer
          runId={drawerRunId}
          open={!!drawerRunId}
          onClose={() => setDrawerRunId(undefined)}
        />
      </div>
    </>
  );
};

export default Chat;

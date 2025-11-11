import { useEffect } from 'react';
import { PromptInput } from '@/components/chat/PromptInput';
import { Sidebar } from '@/components/layout/Sidebar';
import { Loader2 } from 'lucide-react';
import { useSidebarRuns } from '@/hooks/useSidebarRuns';
import { useKindeAuth } from '@kinde-oss/kinde-auth-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getDataSource, getFeatureFlags } from '@/lib/flags/featureFlags';
import ChatStream from '@/components/chat/ChatStream';
import RunDetailDrawer from '@/components/runs/RunDetailDrawer';
import { type Question } from '@/components/QuestionsPanel';
import { createLogger } from '@/lib/utils/logger';
import { useToast } from '@/hooks/use-toast';
import type {
  UiRunSummary,
} from '@/lib/datasources/DataSource';
import { trackDataSourceActive } from '@/lib/telemetry/telemetry';
import api from '@/apis/client';
import { useNavigationWarning } from '@/hooks/useNavigationWarning';
import { useChatState } from '@/hooks/useChatState';
import { useRunActions } from '@/hooks/useRunActions';
import { useWebSocketEvents } from '@/hooks/useWebSocketEvents';
import ChatHeader from '@/components/chat/ChatHeader';

// Initialize data source at the top to avoid ReferenceError
const dataSource = getDataSource();
const logger = createLogger('Chat');

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
    questions,
    setQuestions,
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

  const {
    handleNewPrompt,
    handleNewTask,
    ensureDraftForTyping,
    handleStartTypingOnce: handleStartTypingOnceHook,
  } = runActions;

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
      const combined: typeof server = [] as unknown[];
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

  // Handle OAuth redirect with runId parameter (after app installation)
  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    const runIdParam = sp.get('runId');

    if (runIdParam) {
      console.log('[Chat] OAuth redirect detected with runId:', runIdParam);

      // Check if there's pending install data in localStorage
      const pendingStr = localStorage.getItem('qd.pendingInstall');
      if (pendingStr) {
        console.log('[Chat] Found pending install data, clearing and starting fresh');

        (async () => {
          try {
            // Fetch the original run to get its prompt for prefilling
            const { run } = await dataSource.getRun(runIdParam);
            const originalPrompt = run.prompt || '';

            // Clean up localStorage FIRST
            localStorage.removeItem('qd.pendingInstall');

            // Clear the active run and start fresh
            setActiveRunId(undefined);

            // Clear runs state to prevent old run from being displayed
            setRuns([]);

            // Prefill the input with the original prompt
            if (originalPrompt) {
              setPrefill(originalPrompt);
            }

            // Skip auto-selection of sidebar runs
            skipAutoSelectRef.current = true;

            // Show success toast
            toast({
              title: 'App installed successfully',
              description: 'You can now retry your task with the newly connected app.',
            });

            // Navigate to clean URL with ONLY startNew flag (remove runId completely)
            navigate('/chat?startNew=1', { replace: true });
          } catch (error) {
            console.warn('[Chat] Failed to fetch run for prefill:', error);
            localStorage.removeItem('qd.pendingInstall');
            setActiveRunId(undefined);
            navigate('/chat', { replace: true });
            toast({
              title: 'App installed successfully',
              description: 'You can now start a new task using this app.',
            });
          }
        })();
      } else {
        // No pending install data, just clean up URL
        navigate('/chat', { replace: true });
      }
    }
  }, [location.search, navigate, toast, dataSource]);

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

  // Normalize question type from backend string to QuestionsPanel Question type
  const normalizeQuestionType = (t?: string): Question['type'] => {
    const v = String(t || 'text').toLowerCase();
    if (v === 'textarea') return 'textarea';
    if (v === 'email') return 'email';
    if (v === 'email_list' || v === 'email-list') return 'email_list';
    if (v === 'datetime' || v === 'date_time' || v === 'date-time') return 'datetime';
    if (v === 'date') return 'date';
    if (v === 'time') return 'time';
    if (v === 'number' || v === 'numeric') return 'number';
    if (v === 'select') return 'select';
    if (v === 'multiselect' || v === 'multi_select' || v === 'multi-select') return 'multiselect';
    return 'text';
  };

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

  // Debug log
  useEffect(() => {
    console.log('[Index] Navigation blocking state:', {
      hasActiveWork,
      status: activeRun?.status,
      isWaitingForResponse,
      questionsCount: questions.length,
    });
  }, [hasActiveWork, activeRun?.status, isWaitingForResponse, questions.length]);

  // Navigation warning dialog when user tries to leave with active work
  const navigationWarningDialog = useNavigationWarning({
    shouldBlock: hasActiveWork,
    title: 'Leave Active Task?',
    message:
      'You have an active task in progress. If you navigate away now, any unsaved work and execution state will be lost and cannot be recovered. Are you sure you want to leave?',
  });

  // Get autoContinue from run actions hook
  const { autoContinue } = runActions;

  // When returning from an install flow that used localStorage to persist
  // pending install data, ensure the chat activates the run and loads its
  // details so the UI reflects newly-connected credentials.
  useEffect(() => {
    const key = 'qd.pendingInstall';
    let payload: unknown;
    try {
      const raw = localStorage.getItem(key);
      if (raw) payload = JSON.parse(raw) as unknown;
    } catch (e) {
      // ignore parse errors
      payload = undefined;
    }

    const hasRunId = (p: unknown): p is { runId: string | number } =>
      typeof p === 'object' && p !== null && 'runId' in (p as Record<string, unknown>);

    if (!hasRunId(payload)) return;

    const runId = String(payload.runId);
    (async () => {
      try {
        // Attempt to refresh credentials server-side first
        await api.post(`/runs/${runId}/refresh-credentials`);
      } catch (e) {
        // ignore refresh errors
      } finally {
        try {
          localStorage.removeItem(key);
        } catch (e) {
          // ignore
        }
      }

      try {
        // Fetch the run details and ensure the UI selects it
        const { run } = await dataSource.getRun(runId);
        setRuns((prev) => {
          const idx = prev.findIndex((r) => r.id === run.id);
          if (idx === -1) return [run, ...prev];
          const next = [...prev];
          next[idx] = { ...next[idx], ...run, messages: run.messages } as UiRunSummary;
          return next;
        });
        setActiveRunId(runId);
      } catch (e) {
        // If fetching fails, at minimum set the activeRunId so the stream
        // or subsequent fetch will hydrate the run.
        setActiveRunId(runId);
      }
    })();
  }, []);

  // Fallback: if we landed on /chat without query params but localStorage has
  // pending install info, add pending_credential (and runId if available) to
  // the URL so tooling that expects the query param can observe it.
  useEffect(() => {
    try {
      const sp = new URLSearchParams(location.search);
      if (sp.get('pending_credential')) return;
      const raw = localStorage.getItem('qd.pendingInstall');
      if (!raw) return;
      const payload = JSON.parse(raw) as Record<string, unknown> | null;
      if (!payload) return;
      const pending = (payload.pendingCredential ?? payload.pending_credential ?? payload.appId) as
        | string
        | undefined;
      const runId = payload.runId ? String(payload.runId) : undefined;
      if (!pending) return;
      const params = new URLSearchParams(location.search);
      if (runId && !params.get('runId')) params.set('runId', runId);
      params.set('pending_credential', pending);
      navigate(`/chat?${params.toString()}`, { replace: true });
    } catch (e) {
      // ignore
    }
  }, [location.pathname, location.search, navigate]);

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
            onViewProfile={handleViewProfile}
            onEditProfile={handleEditProfile}
            onLogout={handleLogout}
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
              {/** Questions are now rendered inline within ChatStream as a message */}
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

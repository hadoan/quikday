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
import { Button } from '@/components/ui/button';
// Removed mockRuns usage to avoid seeding mock data
import { Plug2, Plus, Loader2, Menu } from 'lucide-react';
import { useSidebarRuns } from '@/hooks/useSidebarRuns';
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
import type {
  UiRunSummary,
  UiEvent,
  UiPlanData,
  UiQuestionItem,
  UiQuestionsData,
  UiMessage,
} from '@/lib/datasources/DataSource';
import type { BackendStep } from '@/lib/adapters/backendToViewModel';
import { trackDataSourceActive, trackChatSent, trackRunQueued } from '@/lib/telemetry/telemetry';
import api from '@/apis/client';
import { formatDateTime, formatTime } from '@/lib/datetime/format';
import { useNavigationWarning } from '@/hooks/useNavigationWarning';

const logger = createLogger('Chat');

const Chat = () => {
  const [runs, setRuns] = useState<UiRunSummary[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | undefined>(undefined);
  const { runs: sidebarRuns } = useSidebarRuns(5);
  const [isToolsPanelOpen, setIsToolsPanelOpen] = useState(true);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const activeRun = runs.find((run) => run.id === activeRunId);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const [prefill, setPrefill] = useState<string | undefined>(undefined);
  // Default to the most recent run if none selected,
  // unless a startNew query param is present (which triggers a fresh run).
  useEffect(() => {
    try {
      const sp = new URLSearchParams(location.search);
      const v = sp.get('startNew') || sp.get('startnew');
      if (v === '1' || v === 'true') return;
    } catch {}
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

  // Initialize data source
  const dataSource = getDataSource();
  const { toast } = useToast();
  
  // Determine if navigation should be blocked based on active run state
  const hasActiveWork = Boolean(
    activeRun && 
    (activeRun.status === 'executing' || 
     activeRun.status === 'planning' || 
     activeRun.status === 'scheduled' ||
     activeRun.status === 'awaiting_approval' ||
     activeRun.status === 'awaiting_input' ||
     isWaitingForResponse ||
     questions.length > 0)
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
    message: 'You have an active task in progress. If you navigate away now, any unsaved work and execution state will be lost and cannot be recovered. Are you sure you want to leave?',
  });
  
  // Auto-continue helper: when there are no questions (e.g., only chat.respond),
  // immediately submit empty answers to proceed execution without user click.
  const autoContinue = async (runId?: string) => {
    try {
      if (!runId) return;
      const dsAny: any = dataSource as any;
      const apiBase =
        dsAny?.config?.apiBaseUrl ??
        (typeof window !== 'undefined'
          ? `${window.location.protocol}//${window.location.hostname}:3000`
          : 'http://localhost:3000');
      const url = `${apiBase}/runs/${runId}/continueWithAnswers`;
      const body = JSON.stringify({ answers: {} });
      const res = await (dsAny?.fetch ? dsAny.fetch(url, { method: 'POST', body }) : fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body }));
      if (!res?.ok) {
        // Soft-fail; user can still click Continue if needed
        try { console.warn('[Index] Auto-continue failed:', await res.text()); } catch {}
      }
    } catch (e) {
      console.warn('[Index] Auto-continue error', e);
    }
  };

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

  // Ensure selecting a sidebar run loads its details if not present locally
  useEffect(() => {
    if (!activeRunId) return;
    const exists = runs.some((r) => r.id === activeRunId);
    if (exists) return;
    (async () => {
      try {
        const { run } = await dataSource.getRun(activeRunId);
        setRuns((prev) => [run, ...prev]);
      } catch (e) {
        // best-effort; real-time stream may still populate
      }
    })();
  }, [activeRunId]);

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
        const planQs = (event.payload as { diff?: { questions?: UiQuestionItem[] } })?.diff?.questions;
        if (
          event.runId &&
          event.runId === activeRunId &&
          Array.isArray(planQs) &&
          planQs.length > 0
        ) {
          // Normalize UiQuestionItem[] to QuestionsPanel Question[]
          const qs: Question[] = planQs.map((q) => ({
            key: q.key,
            question: q.question,
            required: q.required,
            placeholder: q.placeholder,
            options: q.options,
            type: normalizeQuestionType(q.type),
          }));
          setQuestions(qs);
        }

        // Or nested in node.exit delta -> output.diff.questions
        const raw = (event.payload as { _raw?: any })?._raw as any;
        const node = raw?.payload?.node as string | undefined;
        const nestedQs = raw?.payload?.delta?.output?.diff?.questions as UiQuestionItem[] | undefined;
        if (
          event.runId &&
          event.runId === activeRunId &&
          node === 'planner' &&
          Array.isArray(nestedQs) &&
          nestedQs.length > 0
        ) {
          const qs: Question[] = nestedQs.map((q) => ({
            key: q.key,
            question: q.question,
            required: q.required,
            placeholder: q.placeholder,
            options: q.options,
            type: normalizeQuestionType(q.type),
          }));
          setQuestions(qs);
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
          const newMessages: UiRunSummary['messages'] = [...(run.messages ?? [])];
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
              const stepsPayload: BackendStep[] =
                (Array.isArray((event.payload as any).steps)
                  ? ((event.payload as any).steps as BackendStep[])
                  : Array.isArray((event.payload as any).plan)
                    ? ((event.payload as any).plan as BackendStep[])
                    : []);

              // Skip plan and proposed changes cards if only chat.respond
              const onlyChatRespond = 
                stepsPayload.length > 0 && 
                stepsPayload.every((step: any) => step?.tool === 'chat.respond');

              if (!onlyChatRespond) {
                const diff = (event.payload as { diff?: { missingFields?: UiQuestionItem[]; status?: string } | undefined }).diff;
                const missingFields: UiQuestionItem[] = Array.isArray(diff?.missingFields)
                  ? (diff!.missingFields as UiQuestionItem[])
                  : [];
                const statusInDiff = typeof diff?.status === 'string' ? String(diff.status) : '';
                const hasMissingInputs = missingFields.length > 0 || statusInDiff === 'awaiting_input';

                if (hasMissingInputs) {
                  // Show only Missing Inputs card; hide Proposed Changes and Plan card
                  if (event.runId === activeRunId) {
                    // Avoid creating duplicate questions cards if one already exists
                    const hasQuestionsCard = newMessages.some(
                      (m) => m && m.type === 'questions' && (m.data as any)?.runId === activeRunId,
                    );
                    if (!hasQuestionsCard) {
                      console.log('[Index] 📝 Missing inputs detected in planner step; showing questions only');
                    if (missingFields.length > 0) {
                      const qMsg: UiMessage = {
                        role: 'assistant',
                        type: 'questions',
                        data: { runId: activeRunId, questions: missingFields } satisfies UiQuestionsData,
                      };
                      newMessages.push(qMsg);
                    }
                } else {
                      console.log('[Index] ⏭️ Skipping duplicate questions card from planner');
                    }
                  }
                } else {
                  // Show Proposed Changes card first, then Plan card
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
              }
              break;
            }
            case 'run_snapshot': {
              // Snapshot includes status and lastAssistant for quick UI hydration
              try {
                const status = (event.payload.status as UiRunSummary['status']) || run.status;
                const lastAssistant = event.payload.lastAssistant as string | undefined;
                const missingFields = event.payload.missingFields as UiQuestionItem[] | undefined;
                
                if (lastAssistant && typeof lastAssistant === 'string' && lastAssistant.trim()) {
                  newMessages.push({ role: 'assistant', content: lastAssistant });
                }
                
                // Add missing inputs questions if present
                if (Array.isArray(missingFields) && missingFields.length > 0) {
                  // Check if we already have a questions card to avoid duplicates
                  const hasQuestionsCard = newMessages.some(
                    (m) => m && m.type === 'questions' && (m.data as any)?.runId === activeRunId,
                  );
                  if (!hasQuestionsCard) {
                    console.log('[Index] 📝 Missing inputs in run_snapshot; adding questions card');
                    newMessages.push({
                      role: 'assistant',
                      type: 'questions',
                      data: {
                        runId: activeRunId,
                        questions: missingFields,
                      } satisfies UiQuestionsData,
                    });
                    
                    // Also set questions state for QuestionsPanel
                    const qs: Question[] = missingFields.map((q) => ({
                      key: q.key,
                      question: q.question,
                      required: q.required,
                      placeholder: q.placeholder,
                      options: q.options,
                      type: normalizeQuestionType(q.type),
                    }));
                    setQuestions(qs);
                  }
                }
                
                // Update run status via nextStatus below
                // fallthrough handled by run_status processing after switch
              } catch (e) {
                console.warn('[Index] Failed to handle run_snapshot', e);
              }
              break;
            }
            case 'step_started': {
              // Render a Params card showing the input request for this step
              try {
                const tool = (event.payload.tool as string) || 'unknown';
                const req = event.payload.request as Record<string, unknown> | undefined;
                const mkStr = (v: unknown) => {
                  if (v === null || v === undefined) return '';
                  if (typeof v === 'string') return v.length > 200 ? v.slice(0, 197) + '…' : v;
                  try {
                    const s = JSON.stringify(v);
                    return s.length > 200 ? s.slice(0, 197) + '…' : s;
                  } catch {
                    return String(v);
                  }
                };
                const items: Array<{ key: string; value: string; full?: unknown }> = req
                  ? Object.entries(req).map(([k, v]) => ({ key: k, value: mkStr(v), full: v }))
                  : [];
                newMessages.push({
                  role: 'assistant',
                  type: 'params',
                  data: { title: `Inputs for ${tool}`, items },
                });
              } catch (e) {
                console.warn('[Index] Failed to render step_started params', e);
              }
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
                console.log('[Index] 🔍 Checking status payload:', {
                  status,
                  hasSteps: Array.isArray((payload as any)?.steps),
                  stepsLength: (payload as any)?.steps?.length,
                  hasQuestions: Array.isArray(payload?.questions),
                  questionsLength: Array.isArray(payload?.questions) ? (payload.questions as any[]).length : 0,
                  questions: payload?.questions,
                });
                
                // If awaiting_approval mid-execution and backend included step details, surface a plan card
                if (
                  status === 'awaiting_approval' &&
                  Array.isArray((payload as any)?.steps) &&
                  (payload as any).steps.length > 0
                ) {
                  // Check if there's already an approval plan card AFTER the last RunCard
                  // This ensures each run can have its own approval card
                  const hasApprovalPlanAfterRunCard =
                    lastRunningCardIndex !== -1 &&
                    newMessages.slice(lastRunningCardIndex + 1).some(
                      (m) => m && m.type === 'plan' && (m.data as UiPlanData)?.awaitingApproval === true,
                    );
                  console.log('[Index] ✅ Creating approval plan card, hasApprovalPlanAfterRunCard:', hasApprovalPlanAfterRunCard);
                  if (!hasApprovalPlanAfterRunCard) {
                    const stepsPayload = (payload as { steps: BackendStep[] }).steps as BackendStep[];
                    newMessages.push(
                      buildPlanMessage({
                        intent: 'Review pending actions',
                        tools: stepsPayload.map((s: any) => s.tool).filter(Boolean),
                        actions: stepsPayload.map((s: any) => s.action || `Execute ${s.tool}`),
                        steps: stepsPayload,
                        awaitingApproval: true,
                        mode: 'approval',
                      }),
                    );
                    console.log('[Index] 📋 Approval plan card created');
                  }
                }
                
                // If awaiting_input and backend included questions, show questions card AFTER plan
                if (
                  status === 'awaiting_input' &&
                  Array.isArray(payload?.questions) &&
                  event.runId === activeRunId
                ) {
                  const qs = (payload.questions as UiQuestionItem[]) || [];
                  console.log('[Index] 💭 Processing awaiting_input with questions:', {
                    questionsCount: qs.length,
                    questions: qs,
                  });
                  
                  // Check if questions card already exists (e.g., from plan_generated event)
                    const hasQuestionsCard = newMessages.some(
                      (m) => m && m.type === 'questions' && (m.data as UiQuestionsData)?.runId === activeRunId,
                    );
                  
                  console.log('[Index] 📝 Questions card check:', {
                    hasQuestionsCard,
                    currentMessagesCount: newMessages.length,
                  });
                  
                  if (!hasQuestionsCard) {
                    console.log('[Index] ✅ Creating questions card with', qs.length, 'questions');
                    // Persist questions as an inline chat message so it stays in place
                    const qMsg: UiMessage = {
                      role: 'assistant',
                      type: 'questions',
                      data: { runId: activeRunId, questions: qs } satisfies UiQuestionsData,
                    };
                    newMessages.push(qMsg);
                  } else {
                    console.log('[Index] ⏭️ Skipping questions card creation - already exists');
                  }
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

                  // Generic: surface any commit results that include presentation hints
                  try {
                    const commits = Array.isArray(output?.commits) ? output.commits : [];
                    for (const c of commits) {
                      const result: any = (c as any)?.result;
                      const presentation = result?.presentation;
                      if (presentation && typeof presentation === 'object') {
                        const title = c?.stepId ? `Result • ${c.stepId}` : 'Result';
                        const content = (() => {
                          try { return JSON.stringify(result, null, 2); } catch { return '[unserializable]'; }
                        })();
                        newMessages.push(
                          buildOutputMessage({
                            title,
                            content,
                            type: 'json',
                            data: result,
                            presentation,
                          }),
                        );
                      }
                    }
                  } catch {}

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

              // Also show a structured Output card (similar to Inputs) for better readability
              try {
                const tool = (event.payload.tool as string) || 'unknown';
                const resp = event.payload.response as Record<string, unknown> | undefined;
                const mkStr = (v: unknown) => {
                  if (v === null || v === undefined) return '';
                  if (typeof v === 'string') return v.length > 200 ? v.slice(0, 197) + '…' : v;
                  try {
                    const s = JSON.stringify(v);
                    return s.length > 200 ? s.slice(0, 197) + '…' : s;
                  } catch {
                    return String(v);
                  }
                };
                const items: Array<{ key: string; value: string; full?: unknown }> = resp
                  ? Object.entries(resp).map(([k, v]) => ({ key: k, value: mkStr(v), full: v }))
                  : [];
                // Best-effort links for Gmail drafts/threads
                if (tool === 'email.draft.create' && resp) {
                  const draftId = (resp['draftId'] as string | undefined) || undefined;
                  const draftMessageId = (resp['messageId'] as string | undefined) || undefined;
                  const threadId = (resp['threadId'] as string | undefined) || undefined;
                  // Best-effort direct draft link: Gmail supports #drafts?compose=<draftId>
                  if (draftMessageId && typeof draftMessageId === 'string' && draftMessageId.trim().length > 0) {
                    const draftUrl = `https://mail.google.com/mail/u/0/#drafts?compose=${encodeURIComponent(draftMessageId)}`;
                    items.push({ key: 'openDraft', value: draftUrl, full: draftUrl });
                  } else {
                    // Fallback: drafts list
                    const listUrl = 'https://mail.google.com/mail/u/0/#drafts';
                    items.push({ key: 'openDrafts', value: listUrl, full: listUrl });
                  }
                  // Intentionally omit thread deep-link; keep draft link only
                }

                // Add quick link to the actual sent conversation for sent-email tools
                if (tool === 'email.send' || tool === 'email.draft.send' || tool === 'email.sendFollowup') {
                  const threadId = (resp?.['threadId'] as string | undefined) || undefined;
                  // Gmail internal message id (not RFC822 Message-ID header)
                  const messageId = ((resp?.['id'] as string | undefined) || (resp?.['messageId'] as string | undefined)) || undefined;
                  if (typeof threadId === 'string' && threadId.trim().length > 0) {
                    const url = `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(threadId)}`;
                    items.push({ key: 'openThread', value: url, full: url });
                  } else if (typeof messageId === 'string' && messageId.trim().length > 0) {
                    const url = `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(messageId)}`;
                    items.push({ key: 'openThread', value: url, full: url });
                  } else {
                    const sentUrl = 'https://mail.google.com/mail/u/0/#sent';
                    items.push({ key: 'openSent', value: sentUrl, full: sentUrl });
                  }
                }
                newMessages.push({
                  role: 'assistant',
                  type: 'params',
                  data: { title: `Output from ${tool}`, items },
                });
              } catch (e) {
                console.warn('[Index] Failed to render output params card', e);
              }

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
                // Ignore executor's param preview (we render ParamsCard from step_started)
                const isParamPreview =
                  event.type === 'assistant.delta' &&
                  typeof text === 'string' &&
                  text.includes('with inputs:') &&
                  text.includes('| Field | Value |');
                if (!isParamPreview && typeof text === 'string' && text.trim().length > 0) {
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

      // Use data source to call /agent/plan endpoint
      const { goal, plan, missing, runId } = await dataSource.createRun({
        prompt,
        mode,
        messages: [...conversationalHistory, { role: 'user', content: prompt }],
      });

      logger.info('✅ Plan received successfully', {
        runId,
        hasGoal: !!goal,
        planSteps: plan?.length || 0,
        missingFields: missing?.length || 0,
        missing,
        timestamp: new Date().toISOString(),
      });

      console.log('[Index.handleNewPrompt] Missing inputs received:', missing);

      // Update the active run with the backend runId
      if (runId) {
        setActiveRunId(runId);
      }

      // Display the plan response
      setRuns((prev) =>
        prev.map((run) => {
          if (run.id !== activeRunId && run.id !== runId) return run;
          
          const newMessages: UiRunSummary['messages'] = [...(run.messages ?? [])];
          
          // Detect if planner returned only chat.respond steps
          const onlyChatRespond = Array.isArray(plan) && plan.length > 0 && plan.every((step: unknown) => {
            const t = (step as any)?.tool;
            return typeof t === 'string' && t === 'chat.respond';
          });

          // Add plan message if we have steps and it's not only chat.respond
          if (Array.isArray(plan) && plan.length > 0 && !onlyChatRespond) {
            const goalData = goal as Record<string, unknown> | null;
            const planData: UiPlanData = {
              intent: (goalData?.intent as string) || 'Process request',
              tools: [],
              actions: [],
              mode: 'plan',
              steps: plan.map((step: unknown, idx: number) => {
                const stepData = step as Record<string, unknown>;
                return {
                  id: `step-${idx}`,
                  tool: (stepData.tool as string) || 'unknown',
                  action: stepData.action as string | undefined,
                  status: 'pending' as const,
                  inputsPreview: stepData.inputs ? JSON.stringify(stepData.inputs) : undefined,
                };
              }),
            };
            newMessages.push({
              role: 'assistant',
              type: 'plan',
              data: planData,
            });
          }
          
          // Add missing inputs questions if present
          if (Array.isArray(missing) && missing.length > 0) {
            // Use the backend runId if available to avoid duplicate questions
            // being added later by WebSocket snapshots for the same run.
            const questionsRunId = runId || activeRunId;
            newMessages.push({
              role: 'assistant',
              type: 'questions',
              data: {
                runId: questionsRunId,
                questions: missing,
              } satisfies UiQuestionsData,
            });
          } else if (!onlyChatRespond) {
            // No missing inputs and not only chat.respond: render Continue panel.
            const questionsRunId = runId || activeRunId;
            newMessages.push({
              role: 'assistant',
              type: 'questions',
              data: {
                runId: questionsRunId,
                questions: [],
              } satisfies UiQuestionsData,
            });
          }
          
          // If no missing inputs and we have a plan, optionally show assistant response
          if ((!missing || missing.length === 0) && plan && plan.length > 0 && !onlyChatRespond) {
            const goalData = goal as Record<string, unknown> | null;
            const goalText = (goalData?.intent as string) || (goalData?.summary as string) || '';
            if (goalText && goalText.trim().length > 0) {
              newMessages.push({
                role: 'assistant',
                content: goalText,
              });
            }
          }
          
          const updated = {
            ...run,
            id: runId || run.id, // Update to backend runId if provided
            prompt: run.prompt || prompt,
            status: (missing && missing.length > 0) ? 'awaiting_input' : 'planning',
            messages: newMessages,
          } as UiRunSummary;

          // Fire-and-forget auto-continue when only chat.respond and no questions
          if (onlyChatRespond && (!missing || missing.length === 0)) {
            void autoContinue(runId || activeRunId);
          }

          return updated;
        }),
      );

      // Hide loading spinner
      setIsWaitingForResponse(false);
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

  // If navigated with ?startNew=1 (from Dashboard template 'Try this'), start a
  // fresh run so we don't reuse an existing active run. We also strip the
  // query param from the URL afterwards to avoid re-creating on reload.
  useEffect(() => {
    try {
      const sp = new URLSearchParams(location.search);
      const v = sp.get('startNew') || sp.get('startnew');
      if (v === '1' || v === 'true') {
        handleNewTask();
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
    setActiveRunId(runId);
    // Clear questions when switching runs to avoid showing old questions
    setQuestions([]);
    // Hide loading spinner when switching runs
    setIsWaitingForResponse(false);
  };

  return (
    <>
      {/* Navigation warning dialog */}
      {navigationWarningDialog}

      <div className="flex h-screen w-full bg-background overflow-hidden">
        <Sidebar
          runs={sidebarRuns}
          activeRunId={activeRunId}
          onSelectRun={handleSelectRun}
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
                    className="h-5 sm:h-6 w-auto dark:hidden flex-shrink-0"
                  />
                  <img
                    src="/logo/logo-dark-bg.svg"
                    alt="Quik.day"
                    className="h-5 sm:h-6 w-auto hidden dark:block flex-shrink-0"
                  />
                  <span className="hidden sm:inline truncate">One Prompt. One Run. Done.</span>
                </h1>
              </div>

              <div className="flex items-center gap-2">
                <ThemeToggle />
                <Button size="sm" onClick={handleNewTask} className="gap-2 h-9">
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">New Task</span>
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
              <PromptInput onSubmit={handleNewPrompt} initialValue={prefill} autoFocus />
            </div>
          </div>
        </div>

      
      </div>
    </>
  );
};

export default Chat;

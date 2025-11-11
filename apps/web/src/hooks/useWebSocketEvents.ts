import { useEffect } from 'react';
import type {
  UiEvent,
  UiRunSummary,
  UiMessage,
  UiQuestionItem,
  UiQuestionsData,
  UiPlanData,
  Question,
} from '@quikday/types';
import type { BackendStep } from '@/lib/adapters/backendToViewModel';
import {
  buildPlanMessage,
  buildOutputMessage,
  buildRunMessage,
  buildLogMessage,
  buildUndoMessage,
} from '@/utils/messageBuilders';
import { normalizeQuestionType } from '@/utils/normalizeQuestionType';
import type { DataSource } from '@/lib/dataSource';

interface UseWebSocketEventsParams {
  dataSource: DataSource;
  activeRunId: string | null;
  setRuns: React.Dispatch<React.SetStateAction<UiRunSummary[]>>;
  setActiveRunId: React.Dispatch<React.SetStateAction<string | null>>;
  setQuestions: React.Dispatch<React.SetStateAction<Question[]>>;
  setIsWaitingForResponse: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 * Manages WebSocket connection and real-time event handling for runs.
 * Processes events like plan_generated, run_status, step_started, run_completed, etc.
 */
export function useWebSocketEvents({
  dataSource,
  activeRunId,
  setRuns,
  setActiveRunId,
  setQuestions,
  setIsWaitingForResponse,
}: UseWebSocketEventsParams) {
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
        const planQs = (event.payload as { diff?: { questions?: UiQuestionItem[] } })?.diff
          ?.questions;
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
        const nestedQs = raw?.payload?.delta?.output?.diff?.questions as
          | UiQuestionItem[]
          | undefined;
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
              const stepsPayload: BackendStep[] = Array.isArray((event.payload as any).steps)
                ? ((event.payload as any).steps as BackendStep[])
                : Array.isArray((event.payload as any).plan)
                  ? ((event.payload as any).plan as BackendStep[])
                  : [];

              // Skip plan and proposed changes cards if only chat.respond
              const onlyChatRespond =
                stepsPayload.length > 0 &&
                stepsPayload.every((step: any) => step?.tool === 'chat.respond');

              if (!onlyChatRespond) {
                const diff = (
                  event.payload as {
                    diff?: { missingFields?: UiQuestionItem[]; status?: string } | undefined;
                  }
                ).diff;
                const missingFields: UiQuestionItem[] = Array.isArray(diff?.missingFields)
                  ? (diff!.missingFields as UiQuestionItem[])
                  : [];
                const statusInDiff = typeof diff?.status === 'string' ? String(diff.status) : '';
                const hasMissingInputs =
                  missingFields.length > 0 || statusInDiff === 'awaiting_input';

                if (hasMissingInputs) {
                  // Show only Missing Inputs card; hide Proposed Changes and Plan card
                  if (event.runId === activeRunId) {
                    // Avoid creating duplicate questions cards if one already exists
                    const hasQuestionsCard = newMessages.some(
                      (m) => m && m.type === 'questions' && (m.data as any)?.runId === activeRunId,
                    );
                    if (!hasQuestionsCard) {
                      console.log(
                        '[Index] 📝 Missing inputs detected in planner step; showing questions only with',
                        stepsPayload.length,
                        'steps',
                      );
                      if (missingFields.length > 0) {
                        const qMsg: UiMessage = {
                          role: 'assistant',
                          type: 'questions',
                          data: {
                            runId: activeRunId,
                            questions: missingFields,
                            steps: stepsPayload as any,
                          } satisfies UiQuestionsData,
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
                console.log(
                  '[Index] After update, message status is:',
                  (newMessages[lastRunningCardIndex]?.data as any)?.status,
                );
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
                  questionsLength: Array.isArray(payload?.questions)
                    ? (payload.questions as any[]).length
                    : 0,
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
                    newMessages
                      .slice(lastRunningCardIndex + 1)
                      .some(
                        (m) =>
                          m &&
                          m.type === 'plan' &&
                          (m.data as UiPlanData)?.awaitingApproval === true,
                      );
                  console.log(
                    '[Index] ✅ Creating approval plan card, hasApprovalPlanAfterRunCard:',
                    hasApprovalPlanAfterRunCard,
                  );
                  if (!hasApprovalPlanAfterRunCard) {
                    const stepsPayload = (payload as { steps: BackendStep[] })
                      .steps as BackendStep[];
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
                  const steps = (payload.steps as any[]) || [];
                  console.log('[Index] 💭 Processing awaiting_input with questions:', {
                    questionsCount: qs.length,
                    questions: qs,
                    stepsCount: steps.length,
                    steps,
                  });

                  // Check if questions card already exists (e.g., from plan_generated event)
                  const hasQuestionsCard = newMessages.some(
                    (m) =>
                      m &&
                      m.type === 'questions' &&
                      (m.data as UiQuestionsData)?.runId === activeRunId,
                  );

                  console.log('[Index] 📝 Questions card check:', {
                    hasQuestionsCard,
                    currentMessagesCount: newMessages.length,
                  });

                  if (!hasQuestionsCard) {
                    console.log(
                      '[Index] ✅ Creating questions card with',
                      qs.length,
                      'questions and',
                      steps.length,
                      'steps',
                    );
                    // Persist questions as an inline chat message so it stays in place
                    const qMsg: UiMessage = {
                      role: 'assistant',
                      type: 'questions',
                      data: { runId: activeRunId, questions: qs, steps } satisfies UiQuestionsData,
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
                          try {
                            return JSON.stringify(result, null, 2);
                          } catch {
                            return '[unserializable]';
                          }
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
                  if (
                    draftMessageId &&
                    typeof draftMessageId === 'string' &&
                    draftMessageId.trim().length > 0
                  ) {
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
                if (
                  tool === 'email.send' ||
                  tool === 'email.draft.send' ||
                  tool === 'email.sendFollowup'
                ) {
                  const threadId = (resp?.['threadId'] as string | undefined) || undefined;
                  // Gmail internal message id (not RFC822 Message-ID header)
                  const messageId =
                    (resp?.['id'] as string | undefined) ||
                    (resp?.['messageId'] as string | undefined) ||
                    undefined;
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
  }, [activeRunId, dataSource, setActiveRunId, setQuestions, setIsWaitingForResponse, setRuns]);
}

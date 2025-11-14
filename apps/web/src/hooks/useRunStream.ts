import { useEffect, Dispatch, SetStateAction } from 'react';
import type {
  UiRunSummary,
  UiEvent,
  UiQuestionItem,
  UiQuestionsData,
  UiPlanData,
  UiMessage,
} from '@/apis/runs';
import type { Question } from '@/components/chat/QuestionsPanel';
import { normalizeQuestionType } from '@/apis/runs';
import type { BackendStep } from '@/lib/adapters/backendToViewModel';
import {
  buildPlanMessage,
  buildRunMessage,
  buildOutputMessage,
} from '@/lib/adapters/backendToViewModel';

interface UseRunStreamParams {
  activeRunId: string | undefined;
  dataSource: any;
  setRuns: Dispatch<SetStateAction<UiRunSummary[]>>;
  setActiveRunId: Dispatch<SetStateAction<string | undefined>>;
  setQuestions: Dispatch<SetStateAction<Question[]>>;
  setIsWaitingForResponse: Dispatch<SetStateAction<boolean>>;
}

/**
 * Custom hook to manage WebSocket connection for real-time run updates
 * Extracts the massive event handling logic from Chat component
 */
export function useRunStream({
  activeRunId,
  dataSource,
  setRuns,
  setActiveRunId,
  setQuestions,
  setIsWaitingForResponse,
}: UseRunStreamParams) {
  useEffect(() => {
    if (!activeRunId) return;

    const stream = dataSource.connectRunStream(activeRunId, (event: UiEvent) => {
      console.log('[useRunStream] Received event:', event);

      // Auto-add incoming run if UI doesn't know about it
      handleIncomingRun(event, setRuns, setActiveRunId);

      // Extract planner questions
      handlePlannerQuestions(event, activeRunId, setQuestions);

      // Hide loading spinner
      if (event.type !== 'connection_established') {
        setIsWaitingForResponse(false);
      }

      // Process event and update messages
      setRuns((prev) =>
        prev.map((run) => {
          if (run.id !== activeRunId) return run;
          return processRunEvent(run, event, activeRunId, setQuestions);
        }),
      );
    });

    return () => {
      if (stream?.disconnect) stream.disconnect();
    };
  }, [activeRunId, dataSource, setRuns, setActiveRunId, setQuestions, setIsWaitingForResponse]);
}

function handleIncomingRun(
  event: UiEvent,
  setRuns: Dispatch<SetStateAction<UiRunSummary[]>>,
  setActiveRunId: Dispatch<SetStateAction<string | undefined>>,
) {
  try {
    const incomingRunId = event.runId;
    if (incomingRunId) {
      setRuns((prev) => {
        const exists = prev.find((r) => r.id === incomingRunId);
        if (exists) return prev;
        const minimal: UiRunSummary = {
          id: incomingRunId,
          prompt: '',
          timestamp: new Date().toISOString(),
          status: 'running' as const,
          messages: [],
        };
        return [minimal, ...prev];
      });
      setActiveRunId((cur) => cur || incomingRunId);
    }
  } catch (e) {
    console.warn('[useRunStream] Failed to auto-add incoming run', e);
  }
}

function handlePlannerQuestions(
  event: UiEvent,
  activeRunId: string,
  setQuestions: Dispatch<SetStateAction<Question[]>>,
) {
  try {
    // Questions from payload.diff.questions
    const planQs = (event.payload as { diff?: { questions?: UiQuestionItem[] } })?.diff?.questions;
    if (event.runId === activeRunId && Array.isArray(planQs) && planQs.length > 0) {
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

    // Questions from nested node.exit delta
    const raw = (event.payload as { _raw?: any })?._raw as any;
    const node = raw?.payload?.node as string | undefined;
    const nestedQs = raw?.payload?.delta?.output?.diff?.questions as UiQuestionItem[] | undefined;
    if (
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
  } catch {}
}

function processRunEvent(
  run: UiRunSummary,
  event: UiEvent,
  activeRunId: string,
  setQuestions: Dispatch<SetStateAction<Question[]>>,
): UiRunSummary {
  const nextStatus = (event.payload.status as UiRunSummary['status']) || run.status;
  const newMessages: UiRunSummary['messages'] = [...(run.messages ?? [])];

  switch (event.type) {
    case 'connection_established':
      console.log('[useRunStream] WebSocket connected:', event.payload.message);
      break;

    case 'plan_generated':
      handlePlanGenerated(event, activeRunId, newMessages);
      break;

    case 'step_started':
      handleStepStarted(event, newMessages);
      break;

    default:
      // Handle other event types as needed
      break;
  }

  return { ...run, status: nextStatus, messages: newMessages };
}

function handlePlanGenerated(event: UiEvent, activeRunId: string, newMessages: UiMessage[]) {
  const intent = (event.payload.intent as string) || 'Process request';
  const tools = (event.payload.tools as string[]) || [];
  const actions = (event.payload.actions as string[]) || [];
  const stepsPayload: BackendStep[] = Array.isArray((event.payload as any).steps)
    ? ((event.payload as any).steps as BackendStep[])
    : Array.isArray((event.payload as any).plan)
      ? ((event.payload as any).plan as BackendStep[])
      : [];

  const onlyChatRespond =
    stepsPayload.length > 0 && stepsPayload.every((step: any) => step?.tool === 'chat.respond');

  if (onlyChatRespond) return;

  const diff = (event.payload as { diff?: { missingFields?: UiQuestionItem[]; status?: string } })
    .diff;
  const missingFields: UiQuestionItem[] = Array.isArray(diff?.missingFields)
    ? (diff!.missingFields as UiQuestionItem[])
    : [];
  const statusInDiff = typeof diff?.status === 'string' ? String(diff.status) : '';
  const hasMissingInputs = missingFields.length > 0 || statusInDiff === 'awaiting_input';

  if (hasMissingInputs) {
    if (event.runId === activeRunId) {
      const hasQuestionsCard = newMessages.some(
        (m) => m && m.type === 'questions' && (m.data as any)?.runId === activeRunId,
      );
      if (!hasQuestionsCard && missingFields.length > 0) {
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
    }
  } else {
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
        console.warn('[useRunStream] Failed to render diff preview', e);
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

function handleStepStarted(event: UiEvent, newMessages: UiMessage[]) {
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
    console.warn('[useRunStream] Failed to render step_started params', e);
  }
}

function handleRunStatus(
  event: UiEvent,
  newMessages: UiMessage[],
  activeRunId: string,
  setQuestions: Dispatch<SetStateAction<Question[]>>,
) {
  const status =
    (event.type === 'run_completed' ? 'succeeded' : (event.payload.status as string)) || 'queued';
  const started_at =
    (event.payload.started_at as string | undefined) ||
    (event.payload.startedAt as string | undefined) ||
    (event.ts as string | undefined);
  const completed_at =
    (event.payload.completed_at as string | undefined) ||
    (event.payload.completedAt as string | undefined);

  // Find and update last active RunCard
  let lastRunningCardIndex = -1;
  for (let i = newMessages.length - 1; i >= 0; i--) {
    const msg = newMessages[i];
    if (msg && msg.role === 'assistant' && msg.type === 'run' && msg.data) {
      const cardStatus = (msg.data as any).status;
      if (cardStatus && !['succeeded', 'failed', 'partial'].includes(cardStatus)) {
        lastRunningCardIndex = i;
        break;
      }
    }
  }

  if (lastRunningCardIndex !== -1) {
    newMessages[lastRunningCardIndex] = buildRunMessage({
      status,
      started_at,
      completed_at,
    });
  } else {
    newMessages.push(
      buildRunMessage({
        status,
        started_at,
        completed_at,
      }),
    );
  }

  // Handle approval and input awaiting status
  const payload = event.payload as Record<string, unknown>;

  if (
    status === 'awaiting_approval' &&
    Array.isArray((payload as any)?.steps) &&
    (payload as any).steps.length > 0
  ) {
    const hasApprovalPlanAfterRunCard =
      lastRunningCardIndex !== -1 &&
      newMessages
        .slice(lastRunningCardIndex + 1)
        .some((m) => m && m.type === 'plan' && (m.data as UiPlanData)?.awaitingApproval === true);

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
    }
  }

  if (
    status === 'awaiting_input' &&
    Array.isArray(payload?.questions) &&
    event.runId === activeRunId
  ) {
    const qs = (payload.questions as UiQuestionItem[]) || [];
    const hasQuestionsCard = newMessages.some(
      (m) => m && m.type === 'questions' && (m.data as UiQuestionsData)?.runId === activeRunId,
    );

    if (!hasQuestionsCard) {
      const steps = (payload.steps as any[]) || [];
      newMessages.push({
        role: 'assistant',
        type: 'questions',
        data: {
          runId: activeRunId,
          questions: qs,
          steps,
        } satisfies UiQuestionsData,
      });
      const questions: Question[] = qs.map((q) => ({
        key: q.key,
        question: q.question,
        required: q.required,
        placeholder: q.placeholder,
        options: q.options,
        type: normalizeQuestionType(q.type),
      }));
      setQuestions(questions);
    }
  }
}

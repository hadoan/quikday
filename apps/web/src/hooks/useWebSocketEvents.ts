import { useEffect } from 'react';
import type { UiEvent, UiRunSummary, UiMessage, UiQuestionsData, Question } from '@quikday/types';
import { normalizeQuestionType } from '@/utils/normalizeQuestionType';
import type { DataSource } from '@/lib/datasources/DataSource';
import { buildRunMessage } from '@/utils/messageBuilders';

interface UseWebSocketEventsParams {
  dataSource: DataSource;
  activeRunId: string | null;
  setRuns: React.Dispatch<React.SetStateAction<UiRunSummary[]>>;
  setActiveRunId: React.Dispatch<React.SetStateAction<string | null>>;
  setQuestions: React.Dispatch<React.SetStateAction<Question[]>>;
  setIsWaitingForResponse: React.Dispatch<React.SetStateAction<boolean>>;
}

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

    const stream = dataSource.connectRunStream(activeRunId, async (event: UiEvent) => {
      console.log('[useWebSocketEvents] event:', event);

      const payloadRunId =
        (event.payload as { runId?: string } | undefined)?.runId || event.runId || null;

      if (payloadRunId) {
        setRuns((prev) => {
          const exists = prev.some((run) => run.id === payloadRunId);
          if (exists) return prev;
          const minimal: UiRunSummary = {
            id: payloadRunId,
            prompt: '',
            timestamp: new Date().toISOString(),
            status: 'running',
            messages: [],
          };
          return [minimal, ...prev];
        });

        setActiveRunId((cur) => cur || payloadRunId);
      }

      if (event.type === 'connection_established') {
        return;
      }

      if (event.type !== 'chat_updated') {
        return;
      }

      const chatItemId = (event.payload as { chatItemId?: string } | undefined)?.chatItemId;

      if (!payloadRunId || !chatItemId) {
        return;
      }

      try {
        const { item, message } = await dataSource.getChatItem(payloadRunId, chatItemId);
        let nextMessage = message;
        let appendMessage = true;

        if (item.type === 'status') {
          const content = (item.content as Record<string, unknown>) || {};
          const eventType = typeof content.eventType === 'string' ? content.eventType : '';
          const statusPayload =
            content.payload && typeof content.payload === 'object' ? (content.payload as any) : {};

          if (['run_status', 'run_completed', 'run_failed'].includes(eventType)) {
            nextMessage = buildRunMessage({
              status: statusPayload.status as string,
              started_at: statusPayload.started_at as string | undefined,
              completed_at: statusPayload.completed_at as string | undefined,
              progress: statusPayload.progress as number | undefined,
            });
          } else {
            appendMessage = false;
          }
        }

        setRuns((prev) =>
          prev.map((run) => {
            if (run.id !== payloadRunId) return run;
            const nextMessages: UiMessage[] = appendMessage
              ? [...(run.messages ?? []), nextMessage]
              : run.messages ?? [];

            let nextStatus = run.status;
            if (
              item.type === 'status' &&
              item.content &&
              typeof item.content === 'object' &&
              (item.content as any)?.payload &&
              typeof (item.content as any).payload.status === 'string'
            ) {
              nextStatus = (item.content as any).payload.status as UiRunSummary['status'];
            }

            return {
              ...run,
              status: nextStatus,
              messages: nextMessages,
            };
          }),
        );

        setIsWaitingForResponse(false);

        if (nextMessage.type === 'questions' && payloadRunId === activeRunId) {
          const qd = (nextMessage.data as UiQuestionsData) || { questions: [] };
          const qs: Question[] = Array.isArray(qd?.questions)
            ? qd.questions.map((q) => ({
                key: q.key,
                question: q.question,
                required: q.required,
                placeholder: q.placeholder,
                options: q.options,
                type: normalizeQuestionType(q.type),
              }))
            : [];
          setQuestions(qs);
        }
      } catch (error) {
        console.error('[useWebSocketEvents] Failed to fetch chat item', error);
      }
    });

    return () => {
      stream?.close();
    };
  }, [activeRunId, dataSource, setRuns, setActiveRunId, setQuestions, setIsWaitingForResponse]);
}

import { useEffect } from 'react';
import type { UiEvent, UiRunSummary, UiMessage, UiQuestionsData, Question } from '@quikday/types';
import { normalizeQuestionType } from '@/utils/normalizeQuestionType';
import type { DataSource } from '@/lib/datasources/DataSource';

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
      console.log('[useWebSocketEvents] connectRunStream event:', event);
      if (event.type === 'connection_established') {
        return;
      }

      if (event.type !== 'chat_updated') {
        return;
      }

      console.log('[useWebSocketEvents] chat_updated event:', event);

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

      const chatItemId = (event.payload as { chatItemId?: string } | undefined)?.chatItemId;

      if (!payloadRunId || !chatItemId) {
        return;
      }

      try {
        const { item, message } = await dataSource.getChatItem(payloadRunId, chatItemId);
        const nextMessage = message;

        setRuns((prev) =>
          prev.map((run) => {
            if (run.id !== payloadRunId) return run;

            const currentMessages = run.messages ?? [];
            let nextMessages = currentMessages;

            if (nextMessage.type === 'run') {
              const idx = [...currentMessages].reverse().findIndex((msg) => msg?.type === 'run');
              if (idx !== -1) {
                const targetIndex = currentMessages.length - 1 - idx;
                nextMessages = currentMessages.map((msg, i) =>
                  i === targetIndex ? nextMessage : msg,
                );
              } else {
                nextMessages = [...currentMessages, nextMessage];
              }
            } else {
              nextMessages = [...currentMessages, nextMessage];
            }

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

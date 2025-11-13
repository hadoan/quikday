import { useCallback } from 'react';
import type { UiRunSummary, UiPlanData, UiQuestionsData, UiAppCredentialsData, ApiPlanStep } from '@/apis/runs';
import { getDataSource } from '@/lib/flags/featureFlags';
import { createLogger } from '@/lib/utils/logger';
import { trackChatSent } from '@/lib/telemetry/telemetry';
import { Question } from '@/components/chat/QuestionsPanel';
import { autoContinue as autoContinueHelper } from '@/apis/runs';

const logger = createLogger('useRunActions');
const dataSource = getDataSource();

export interface UseRunActionsParams {
  activeRunId: string | undefined;
  activeRun: UiRunSummary | undefined;
  setRuns: React.Dispatch<React.SetStateAction<UiRunSummary[]>>;
  setActiveRunId: React.Dispatch<React.SetStateAction<string | undefined>>;
  setQuestions: React.Dispatch<React.SetStateAction<Question[]>>;
  setIsWaitingForResponse: React.Dispatch<React.SetStateAction<boolean>>;
  setPrefill: React.Dispatch<React.SetStateAction<string | undefined>>;
  toast: (options: {
    title: string;
    description?: string;
    variant?: 'default' | 'destructive';
  }) => void;
}

export interface UseRunActionsResult {
  handleNewPrompt: (prompt: string, mode?: 'preview' | 'approval' | 'auto') => Promise<void>;
  handleNewTask: () => string;
  handleSelectRun: (runId: string) => void;
  ensureDraftForTyping: (nextText: string) => void;
  handleStartTypingOnce: () => void;
  autoContinue: (runId?: string) => Promise<void>;
}

/**
 * useRunActions - Manages run lifecycle actions (create, select, update).
 * Follows Single Responsibility Principle by handling only run operations.
 * DRY principle: Centralizes run management logic used across components.
 */
export function useRunActions(params: UseRunActionsParams): UseRunActionsResult {
  const {
    activeRunId,
    activeRun,
    setRuns,
    setActiveRunId,
    setQuestions,
    setIsWaitingForResponse,
    setPrefill,
    toast,
  } = params;

  // Auto-continue helper: when there are no questions (e.g., only chat.respond),
  // immediately submit empty answers to proceed execution without user click.
  const autoContinue = useCallback(async (runId?: string) => {
    await autoContinueHelper(runId, dataSource);
  }, []);

  const handleNewPrompt = useCallback(
    async (prompt: string, mode: 'preview' | 'approval' | 'auto' = 'preview') => {
      // Clear prefill after user submits
      setPrefill(undefined);

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
          planSteps: plan,
          missingFields: missing?.length || 0,
          missing,
          timestamp: new Date().toISOString(),
        });

        console.log('[useRunActions.handleNewPrompt] Missing inputs received:', missing);

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
            const onlyChatRespond =
              Array.isArray(plan) &&
              plan.length > 0 &&
              plan.every((step: ApiPlanStep) => step.tool === 'chat.respond');

            // Add plan message if we have steps and it's not only chat.respond
            const steps = plan.map((step: ApiPlanStep, idx: number) => ({
              id: `step-${idx}`,
              tool: step.tool || 'unknown',
              action: step.action,
              status: 'pending' as const,
              inputsPreview: step.inputs ? JSON.stringify(step.inputs) : undefined,
              credentialId: step.credentialId,
              appId: step.appId
            }));

            if (Array.isArray(plan) && plan.length > 0 && !onlyChatRespond) {
              const goalData = goal as Record<string, unknown> | null;
              const planData: UiPlanData = {
                intent: (goalData?.outcome as string) || 'Process request',
                tools: [],
                actions: [],
                mode: 'plan',
                steps,
              };
              newMessages.push({
                role: 'assistant',
                type: 'plan',
                data: planData,
              });
            }
            const hasMissingCredentials = plan.some((step: ApiPlanStep) => step.appId && (step.credentialId === null || step.credentialId === undefined));

            // Add app_credentials message if there are steps with missing credentials
            if (hasMissingCredentials) {
              const questionsRunId = runId || activeRunId;
              newMessages.push({
                role: 'assistant',
                type: 'app_credentials',
                data: {
                  runId: questionsRunId,
                  steps,
                } satisfies UiAppCredentialsData,
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
                  steps, // Include plan steps for credential checking
                  hasMissingCredentials,
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
                  steps, // Include plan steps for credential checking
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
              status: missing && missing.length > 0 ? 'awaiting_input' : 'planning',
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
    },
    [
      activeRunId,
      activeRun,
      setRuns,
      setActiveRunId,
      setIsWaitingForResponse,
      setPrefill,
      toast,
      autoContinue,
    ],
  );

  const handleNewTask = useCallback(() => {
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
    return newId;
  }, [setRuns, setActiveRunId, setQuestions, setIsWaitingForResponse]);

  const handleSelectRun = useCallback((runId: string) => {
    // In Chat screen, clicking a run shows details drawer instead of switching chat
    // This will be handled in the parent component
  }, []);

  // Called on each keystroke: only updates the current draft/run title for sidebar preview
  const ensureDraftForTyping = useCallback(
    (nextText: string) => {
      const targetId = activeRunId;
      if (!targetId) return;
      setRuns((prev) => prev.map((r) => (r.id === targetId ? { ...r, prompt: nextText } : r)));
    },
    [activeRunId, setRuns],
  );

  // Called once on the very first keystroke to decide whether to create a new draft run
  const handleStartTypingOnce = useCallback(() => {
    // This will be managed by parent component using draftIdRef
  }, []);

  return {
    handleNewPrompt,
    handleNewTask,
    handleSelectRun,
    ensureDraftForTyping,
    handleStartTypingOnce,
    autoContinue,
  };
}

import { useState, useRef } from 'react';
import type { UiRunSummary } from '@/apis/runs';
import { Question } from '@/components/chat/QuestionsPanel';
import { StepInfo } from '@/components/chat/MissingCredentials';

export interface ChatState {
  runs: UiRunSummary[];
  setRuns: React.Dispatch<React.SetStateAction<UiRunSummary[]>>;
  activeRunId: string | undefined;
  setActiveRunId: React.Dispatch<React.SetStateAction<string | undefined>>;
  activeRun: UiRunSummary | undefined;
  isSidebarCollapsed: boolean;
  setIsSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  questions: Question[];
  setQuestions: React.Dispatch<React.SetStateAction<Question[]>>;
  steps: StepInfo[];
  setSteps: React.Dispatch<React.SetStateAction<StepInfo[]>>;
  isWaitingForResponse: boolean;
  setIsWaitingForResponse: React.Dispatch<React.SetStateAction<boolean>>;
  drawerRunId: string | undefined;
  setDrawerRunId: React.Dispatch<React.SetStateAction<string | undefined>>;
  prefill: string | undefined;
  setPrefill: React.Dispatch<React.SetStateAction<string | undefined>>;
  bottomRef: React.RefObject<HTMLDivElement | null>;
  draftIdRef: React.MutableRefObject<string | undefined>;
  skipAutoSelectRef: React.MutableRefObject<boolean>;
}

/**
 * Manages all chat-related state in one place.
 * Follows Single Responsibility Principle by focusing only on state.
 */
export function useChatState(): ChatState {
  const [runs, setRuns] = useState<UiRunSummary[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | undefined>(undefined);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [steps, setSteps] = useState<StepInfo[]>([]);
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const [drawerRunId, setDrawerRunId] = useState<string | undefined>(undefined);
  const [prefill, setPrefill] = useState<string | undefined>(undefined);

  const draftIdRef = useRef<string | undefined>(undefined);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const skipAutoSelectRef = useRef(false);

  const activeRun = runs.find((run) => run.id === activeRunId);

  return {
    runs,
    setRuns,
    activeRunId,
    setActiveRunId,
    activeRun,
    isSidebarCollapsed,
    setIsSidebarCollapsed,
    questions,
    setQuestions,
    steps,
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
  };
}

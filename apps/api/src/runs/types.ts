export type RiskLevel = 'low' | 'medium' | 'high';

export interface Goal {
  outcome?: string;
  context?: Record<string, unknown>;
  provided?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface PlanStep {
  id?: string;
  tool: string;
  args?: Record<string, unknown>;
  dependsOn?: string[];
  risk?: RiskLevel;
  // Enrichment fields used by API when available
  appId?: string | null;
  credentialId?: number | null;
}

export interface MissingField {
  key: string;
  question: string;
  type?: string;
  required?: boolean;
  options?: unknown[];
  [key: string]: unknown;
}


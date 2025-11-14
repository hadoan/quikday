/**
 * featureFlags.ts
 *
 * Feature flag management for data source switching and other experimental features.
 * Supports environment variables and runtime overrides via query params.
 */

import type { RunApiConfig } from '@/apis/runs';
import { RunApiClient } from '@/apis/runs';

// Backward compatibility types
type DataSourceConfig = RunApiConfig;
type DataSource = RunApiClient;

// ============================================================================
// Types
// ============================================================================

export type DataSourceType = 'mock' | 'live';

export interface FeatureFlags {
  // Data source
  dataSource: DataSourceType;

  // Feature-specific flags (for future use)
  liveApprovals: boolean;
  liveUndo: boolean;
  liveCredentials: boolean;

  // Dev tools
  showDebugInfo: boolean;
}

// ============================================================================
// Default Flags
// ============================================================================

const DEFAULT_FLAGS: FeatureFlags = {
  dataSource: 'live',
  liveApprovals: true, // Enable by default for approval feature development
  liveUndo: false,
  liveCredentials: false,
  showDebugInfo: false,
};

// ============================================================================
// Flag Resolution (ENV + Query Params)
// ============================================================================

function getEnvDataSource(): DataSourceType {
  const envValue = import.meta.env?.VITE_DATA_SOURCE;

  if (envValue === 'live' || envValue === 'api') {
    return 'live';
  }

  return 'live';
}

function getQueryParam(name: string): string | null {
  if (typeof window === 'undefined') return null;

  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

function resolveFlags(): FeatureFlags {
  const flags: FeatureFlags = { ...DEFAULT_FLAGS };

  // Apply environment variables
  flags.dataSource = getEnvDataSource();

  // Apply query param overrides (for dev/QA)
  const dsQuery = getQueryParam('ds');
  if (dsQuery === 'live' || dsQuery === 'api') {
    flags.dataSource = 'live';
  } else if (dsQuery === 'mock') {
    flags.dataSource = 'mock';
  }

  // Feature flags
  const ff = getQueryParam('ff');
  if (ff) {
    const features = ff.split(',');

    if (features.includes('live-approvals')) {
      flags.liveApprovals = true;
    }

    if (features.includes('live-undo')) {
      flags.liveUndo = true;
    }

    if (features.includes('live-credentials')) {
      flags.liveCredentials = true;
    }

    if (features.includes('debug')) {
      flags.showDebugInfo = true;
    }
  }

  return flags;
}

// ============================================================================
// Global Flags Instance
// ============================================================================

let currentFlags: FeatureFlags = resolveFlags();

export function getFeatureFlags(): Readonly<FeatureFlags> {
  return { ...currentFlags };
}

export function updateFeatureFlags(partial: Partial<FeatureFlags>): void {
  currentFlags = { ...currentFlags, ...partial };

  if (currentFlags.showDebugInfo) {
    console.log('[FeatureFlags] Updated:', currentFlags);
  }
}

// ============================================================================
// DataSource Factory
// ============================================================================

let dataSourceInstance: DataSource | null = null;

export function getDataSource(config?: DataSourceConfig): DataSource {
  const flags = getFeatureFlags();

  // Return cached instance if exists
  if (dataSourceInstance) {
    return dataSourceInstance;
  }

  // Always use RunApiClient
  const mode = flags.dataSource;
  console.log(`[FeatureFlags] Using RunApiClient (${mode})`);
  dataSourceInstance = new RunApiClient(config);

  return dataSourceInstance;
}

export function resetDataSource(): void {
  dataSourceInstance = null;
}

// ============================================================================
// Runtime Toggle (for dev UI)
// ============================================================================

export function toggleDataSource(): DataSourceType {
  const current = currentFlags.dataSource;
  const next = current === 'mock' ? 'live' : 'mock';

  updateFeatureFlags({ dataSource: next });
  resetDataSource();

  console.log(`[FeatureFlags] Toggled data source: ${current} → ${next}`);

  return next;
}

// ============================================================================
// URL Helpers (update query params without reload)
// ============================================================================

export function updateUrlQueryParams(params: Record<string, string>): void {
  if (typeof window === 'undefined') return;

  const url = new URL(window.location.href);

  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      url.searchParams.set(key, value);
    } else {
      url.searchParams.delete(key);
    }
  });

  window.history.replaceState({}, '', url.toString());
}

// ============================================================================
// Dev Info (logging)
// ============================================================================

export function logFeatureFlagsInfo(): void {
  const flags = getFeatureFlags();

  console.group('🚩 Feature Flags');
  console.log('Data Source:', flags.dataSource);
  console.log('Live Approvals:', flags.liveApprovals);
  console.log('Live Undo:', flags.liveUndo);
  console.log('Live Credentials:', flags.liveCredentials);
  console.log('Show Debug Info:', flags.showDebugInfo);
  console.groupEnd();

  console.group('🌐 Environment');
  console.log('VITE_DATA_SOURCE:', import.meta.env?.VITE_DATA_SOURCE || '(not set)');
  console.log('VITE_API_BASE_URL:', import.meta.env?.VITE_API_BASE_URL || '(not set)');
  console.log('VITE_WS_BASE_URL:', import.meta.env?.VITE_WS_BASE_URL || '(not set)');
  console.groupEnd();
}

// ============================================================================
// Initialization (run on module load)
// ============================================================================

if (currentFlags.showDebugInfo) {
  logFeatureFlagsInfo();
}

import { z } from 'zod';

export enum ErrorCode {
  E_CREDENTIAL_MISSING = 'E_CREDENTIAL_MISSING',
  E_CREDENTIAL_INVALID = 'E_CREDENTIAL_INVALID',
  E_CREDENTIAL_SCOPE_MISMATCH = 'E_CREDENTIAL_SCOPE_MISMATCH',
  E_POLICY_BLOCKED = 'E_POLICY_BLOCKED',
  E_PLAN_FAILED = 'E_PLAN_FAILED',
  E_STEP_FAILED = 'E_STEP_FAILED',
  E_RATE_LIMITED = 'E_RATE_LIMITED',
  E_SCHEDULE_INVALID = 'E_SCHEDULE_INVALID',
}

export const RemediationAction = z.object({
  type: z.enum(['connect_app', 'select_profile', 'enable_app', 'contact_admin']),
  label: z.string(),
  url: z.string().optional(),
  appId: z.string().optional(),
});

export type RemediationAction = z.infer<typeof RemediationAction>;

export const CredentialError = z.object({
  code: z.nativeEnum(ErrorCode),
  message: z.string(),
  appId: z.string(),
  credentialId: z.number().optional(),
  remediation: z.array(RemediationAction),
  metadata: z.record(z.any()).optional(),
});

export type CredentialError = z.infer<typeof CredentialError>;

export const RunError = z.object({
  code: z.nativeEnum(ErrorCode),
  message: z.string(),
  step: z.string().optional(),
  tool: z.string().optional(),
  appId: z.string().optional(),
  remediation: z.array(RemediationAction).optional(),
  metadata: z.record(z.any()).optional(),
});

export type RunError = z.infer<typeof RunError>;

export class QuikDayError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly message: string,
    public readonly remediation: RemediationAction[] = [],
    public readonly metadata?: Record<string, any>,
  ) {
    super(message);
    this.name = 'QuikDayError';
  }

  toJSON(): RunError {
    return {
      code: this.code,
      message: this.message,
      remediation: this.remediation,
      metadata: this.metadata,
    };
  }
}

export class CredentialMissingError extends QuikDayError {
  constructor(
    public readonly appId: string,
    public readonly owner: 'user' | 'team',
  ) {
    super(
      ErrorCode.E_CREDENTIAL_MISSING,
      `No credential found for app "${appId}"`,
      [
        {
          type: 'connect_app',
          label: `Connect ${appId}`,
          url: `/apps/${appId}/connect`,
          appId,
        },
      ],
      { appId, owner },
    );
  }
}

export class CredentialInvalidError extends QuikDayError {
  constructor(
    public readonly appId: string,
    public readonly credentialId: number,
  ) {
    super(
      ErrorCode.E_CREDENTIAL_INVALID,
      `Credential for app "${appId}" is invalid or expired`,
      [
        {
          type: 'connect_app',
          label: `Reconnect ${appId}`,
          url: `/apps/${appId}/connect`,
          appId,
        },
        {
          type: 'select_profile',
          label: 'Choose another profile',
          url: `/credentials?appId=${appId}`,
          appId,
        },
      ],
      { appId, credentialId },
    );
  }
}

export class CredentialScopeMismatchError extends QuikDayError {
  constructor(
    public readonly appId: string,
    public readonly credentialId: number,
    public readonly requiredScopes: string[],
  ) {
    super(
      ErrorCode.E_CREDENTIAL_SCOPE_MISMATCH,
      `Credential for app "${appId}" lacks required permissions: ${requiredScopes.join(', ')}`,
      [
        {
          type: 'connect_app',
          label: `Reconnect ${appId} with required permissions`,
          url: `/apps/${appId}/connect`,
          appId,
        },
      ],
      { appId, credentialId, requiredScopes },
    );
  }
}

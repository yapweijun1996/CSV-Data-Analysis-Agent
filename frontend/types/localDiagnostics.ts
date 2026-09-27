import type { CloudAiProvider } from './app';

export type LocalDiagnosticOutcome =
    | 'started'
    | 'succeeded'
    | 'failed'
    | 'blocked'
    | 'cancelled';

/**
 * Local-only production diagnostic record. Payloads may contain business data
 * and therefore never belong in the public support bundle.
 */
export interface LocalDiagnosticRecord {
    id: string;
    recordedAt: string;
    expiresAt: string;
    runId: string | null;
    phase: string;
    attempt: number;
    tool: string;
    provider: CloudAiProvider | 'local';
    model: string | null;
    durationMs: number | null;
    outcome: LocalDiagnosticOutcome;
    reasonCode: string | null;
    payload: unknown;
    estimatedBytes: number;
}

export interface LocalDiagnosticContext {
    runId: string | null;
    phase: string;
    attempt: number;
    tool: string;
}

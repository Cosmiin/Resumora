import type { PriceSnapshot, Usage } from './accounting.ts';

export type Operation = 'connection_check' | 'cv_parse' | 'job_parse' | 'cv_tailor' | 'cv_rewrite';
export type Outcome = 'started' | 'completed' | 'incomplete' | 'failed' | 'unknown';
export type AttemptStart = {
  attemptId: string;
  operationId: string;
  operation: Operation;
  provider: 'openai' | 'openrouter';
  providerScope: string;
  userId: string;
  modelRequested: string;
  requestFingerprint: string;
  startedAt: string;
};
export type AttemptResult = {
  status: Exclude<Outcome, 'started'>;
  finishedAt: string;
  modelResolved: string | null;
  providerRequestId: string | null;
  providerResponseId: string | null;
  providerStatus: 'completed' | 'incomplete' | 'failed' | null;
  httpStatus: number | null;
  errorCode: 'PROVIDER_REJECTED' | 'PROVIDER_FAILED' | 'TIMEOUT' | 'NETWORK_OR_RESPONSE_UNKNOWN' | 'AVAILABILITY' | 'CANCELLED' | 'POLICY_OR_VALIDATION' | 'OUTPUT_INVALID' | 'OUTPUT_UNSUPPORTED' | null;
  usage: Usage;
  price: PriceSnapshot | null;
  estimatedNanoUsd: string | null;
  // Optional for existing historical/connection-check rows. No raw provider strings.
  upstreamProvider?: string | null;
  routeEvidenceId?: string;
  reportedCost?: { nanoUsd: string; currency: 'USD'; source: 'openrouter.usage.cost'; observedAt: string } | null;
};
export type Attempt = AttemptStart & {
  result: AttemptResult | null;
  // A duplicate delivery of a single provider response is not another charge.
  duplicateOf: string | null;
};
export type Period = { from: string; to: string }; // inclusive UTC dates
export type Totals = {
  attempts: number; completed: number; failed: number; unknown: number; incomplete: number; duplicates: number;
  input: number; output: number; cachedInput: number; reasoning: number;
  unknownUsage: number; unpricedUsage: number; unknownReasoning: number; unknownCost: number; knownNanoUsd: string;
};
export type UsageReport = {
  period: Period;
  totals: Totals;
  models: { name: string; totals: Totals }[];
  operations: { name: string; totals: Totals }[];
  recent: Attempt[]; // at most 50, descending startedAt + attemptId
};

/** Required future durable adapter; no in-memory implementation is used in the Worker.
 * begin must atomically reserve attemptId scoped to identity/operation/body; replay returns
 * created:false, changed context rejects. finish must atomically ingest once and enforce
 * UNIQUE(provider, providerScope, providerResponseId) for counted usage. A real retry uses
 * a new attemptId under the same operationId. Never expire an unknown attempt into free usage.
 * A crash after begin stays started/unknown until reconciliation. report must aggregate the
 * full period in storage and return only 50 recent rows, never an unbounded ledger download.
 */
export interface UsageLedger {
  readonly durability: 'durable' | 'synthetic';
  begin(start: AttemptStart): Promise<{ created: boolean; attempt: Attempt }>;
  finish(attemptId: string, result: AttemptResult): Promise<Attempt>;
  report(period: Period): Promise<UsageReport>;
}

export function periodFrom(url: URL, now = new Date()): Period {
  const date = (v: string): string => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString().slice(0, 10) !== v) {
      throw new Error('INVALID_PERIOD');
    }
    return v;
  };
  if (url.searchParams.getAll('from').length > 1 || url.searchParams.getAll('to').length > 1) throw new Error('INVALID_PERIOD');
  const from = date(url.searchParams.get('from') ?? now.toISOString().slice(0, 8) + '01');
  const to = date(url.searchParams.get('to') ?? now.toISOString().slice(0, 10));
  if (from > to || (Date.parse(to) - Date.parse(from)) / 86_400_000 > 365) throw new Error('INVALID_PERIOD');
  return { from, to };
}

// Used by synthetic fixtures. Production adapters perform equivalent full-period SQL aggregation.
export function summarize(attempts: readonly Attempt[], period: Period): UsageReport {
  const filtered = attempts.filter(a => a.startedAt.slice(0, 10) >= period.from && a.startedAt.slice(0, 10) <= period.to)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt) || b.attemptId.localeCompare(a.attemptId));
  const aggregate = (rows: Attempt[]): Totals => rows.reduce<Totals>((t, a) => {
    t.attempts++;
    if (a.duplicateOf) { t.duplicates++; return t; }
    const r = a.result;
    if (!r || r.status === 'unknown') t.unknown++;
    else if (r.status === 'completed') t.completed++;
    else if (r.status === 'failed') t.failed++;
    else t.incomplete++;
    if (r?.usage.state === 'reported') {
      t.input += r.usage.input!; t.output += r.usage.output!;
      t.cachedInput += r.usage.cachedInput!; t.reasoning += r.usage.reasoning ?? 0;
      if (r.usage.reasoning === null) t.unknownReasoning++;
      if (r.estimatedNanoUsd === null && r.reportedCost == null) t.unpricedUsage++;
    } else t.unknownUsage++;
    const knownCost = r?.reportedCost?.nanoUsd ?? r?.estimatedNanoUsd;
    if (knownCost != null) t.knownNanoUsd = (BigInt(t.knownNanoUsd) + BigInt(knownCost)).toString();
    else t.unknownCost++;
    return t;
  }, { attempts: 0, completed: 0, failed: 0, unknown: 0, incomplete: 0, duplicates: 0, input: 0, output: 0, cachedInput: 0, reasoning: 0, unknownUsage: 0, unpricedUsage: 0, unknownReasoning: 0, unknownCost: 0, knownNanoUsd: '0' });
  const groups = (key: (a: Attempt) => string) => [...new Set(filtered.map(key))].sort().map(name => ({
    name, totals: aggregate(filtered.filter(a => key(a) === name)),
  }));
  return { period, totals: aggregate(filtered), models: groups(a => a.result?.modelResolved ?? a.modelRequested),
    operations: groups(a => a.operation), recent: filtered.slice(0, 50) };
}

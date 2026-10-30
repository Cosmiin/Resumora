import { normalizeJobIntake, type JobIntake } from './intake.ts';
export type RequirementEvidence = { text: string; priority: 'required' | 'preferred' };
export type JobSave = { requestId: string; intake: JobIntake; snapshotId: string | null; snapshotRevision: number | null;
  requirements: RequirementEvidence[] };
export type SavedJob = { id: string; versionId: string | null; state: 'draft' | 'reviewed'; createdAt: string; intake: JobIntake & {capture?: unknown; extracted?: Record<string, unknown>};
  snapshotId: string | null; snapshotRevision: number | null; requirements: RequirementEvidence[] };
export type JobSummary = Pick<SavedJob, 'id' | 'state' | 'createdAt'> & { title: string; company?:string|null;location?:string|null;workArrangement?:string|null;analysisState?:string|null };
export const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export function parseJobSave(v: unknown): JobSave {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('invalidRequest');
  const r = v as Record<string, unknown>;
  const parsed = normalizeJobIntake(r.intake);
  if (Object.keys(r).some(k => !['requestId','intake','snapshotId','snapshotRevision','requirements'].includes(k)) ||
    !isUuid(r.requestId) || !((r.snapshotId===null&&r.snapshotRevision===null)||(isUuid(r.snapshotId)&&Number.isSafeInteger(r.snapshotRevision)&&Number(r.snapshotRevision)>=1)) ||
    !parsed.ok || parsed.value.baseCv ||
    !Array.isArray(r.requirements) || r.requirements.length > 100) throw new Error('invalidRequest');
  const intake = parsed.value;
  if (r.requirements.some(e => !e || typeof e !== 'object' || Object.keys(e).sort().join(',') !== 'priority,text' ||
    !['required','preferred'].includes(e.priority) || typeof e.text !== 'string' || !e.text.trim() || e.text.length > 1000 ||
    !intake.text.includes(e.text))) throw new Error('invalidRequest');
  return { requestId: r.requestId, snapshotId: r.snapshotId as string|null, snapshotRevision: r.snapshotRevision===null?null:Number(r.snapshotRevision), intake,
    requirements: r.requirements as RequirementEvidence[] };
}

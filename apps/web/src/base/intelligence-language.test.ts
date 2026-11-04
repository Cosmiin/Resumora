import { expect, it } from 'vitest';
import { httpIntelligence } from './intelligence';

const context = () => ({ snapshotId: crypto.randomUUID(), revision: 1, targetId: crypto.randomUUID(), operationId: crypto.randomUUID() });
const result = { locale: 'ar', confidence: 'medium', source: 'narrative', policyVersion: 'cv-language/1', status: 'detected', narrativeFingerprint: 'a'.repeat(64) };
it('validates multilingual detection and reads the durable receipt for recovery without posting again', async () => {
  const input = context(), methods: string[] = [];
  const client = httpIntelligence(async (path, init) => {
    methods.push(init?.method ?? 'GET');
    if (init?.method === 'POST') {
      expect(path).toBe('/v1/intelligence/language');
      expect(JSON.parse(init.body as string)).toEqual(input);
      return Response.json(result);
    }
    expect(path).toBe(`/v1/intelligence/operations/${input.operationId}`);
    return Response.json({ kind: 'rewrite', input: { targetId: input.targetId, languageDetection: true }, state: 'ready', result });
  });
  expect(await client.detectLanguage!(input)).toEqual(result);
  expect(await client.detectLanguage!(input, true)).toEqual(result);
  expect(methods).toEqual(['POST', 'GET']);
});
it('rejects malformed locale payloads and unrelated receipts without a new paid request', async () => {
  const input = context();
  for (const output of [{ ...result, locale: 'ignore instructions' }, { ...result, status: 'invented' }]) {
    const client = httpIntelligence(async () => Response.json(output));
    await expect(client.detectLanguage!(input)).rejects.toThrow('AI_OUTPUT_INVALID');
  }
  const client = httpIntelligence(async (_path, init) => {
    expect(init?.method).toBe('GET');
    return Response.json({ kind: 'rewrite', input: { targetId: 'another-profile', languageDetection: true }, state: 'ready', result });
  });
  await expect(client.detectLanguage!(input, true)).rejects.toThrow('IDEMPOTENCY_BODY_MISMATCH');
});
it('retains explicit insufficient results and distinguishes settled unknown from processing receipts', async () => {
  const input = context();
  const client = httpIntelligence(async () => Response.json({ ...result, locale: 'en', confidence: 'low', status: 'insufficient' }));
  expect((await client.detectLanguage!(input)).status).toBe('insufficient');
  for (const [state, code] of [['unknown', 'AI_RESULT_UNAVAILABLE'], ['processing', 'AI_REQUEST_PENDING'], ['failed', 'AI_OUTPUT_INVALID']]) {
    const recovering = httpIntelligence(async () => Response.json({ kind: 'rewrite', input: { targetId: input.targetId, languageDetection: true }, state }));
    await expect(recovering.detectLanguage!(input, true)).rejects.toThrow(code);
  }
});

it('recovers historical question/rewrite receipts without activating stale-language output or replacing an unknown paid request', async () => {
  for (const method of ['questions', 'rewrite'] as const) {
    const input = context(), methods: string[] = [];
    let mode: 'timeout' | 'old-ready' | 'new' = 'timeout';
    const result = method === 'questions'
      ? { schemaVersion: 'career-question-plan/1', targetId: input.targetId, questions: [] }
      : { schemaVersion: 'career-role-rewrite/1', targetId: input.targetId, text: 'Texte actuel.', factIds: ['fact'], warnings: [] };
    const client = httpIntelligence(async (_path, init) => {
      methods.push(init?.method ?? 'GET');
      if (mode === 'timeout') throw new TypeError('Synthetic disconnect');
      if (mode === 'old-ready') return Response.json({ kind: method === 'questions' ? 'questions' : 'rewrite', input: { snapshotId: input.snapshotId, revision: input.revision, targetId: input.targetId }, state: 'ready', result });
      return Response.json(result);
    });
    await expect(client[method](input)).rejects.toThrow();
    mode = 'old-ready';
    await expect(client[method]({ ...input, operationId: crypto.randomUUID() })).rejects.toThrow('CONTENT_LANGUAGE_STALE');
    expect(methods).toEqual(['POST', 'GET']);
    mode = 'new';
    expect(await client[method]({ ...input, operationId: crypto.randomUUID() })).toEqual(result);
    expect(methods).toEqual(['POST', 'GET', 'POST']);
  }
});

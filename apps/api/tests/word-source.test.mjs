import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { extractWordText } from '../src/intelligence/word-preflight.ts';
import { importWorkflow } from '../src/intelligence/import-workflow.ts';
import { intelligenceRoute } from '../src/intelligence/routes.ts';
import { createDatabaseGateway } from '../src/db/supabase.ts';
import { docx, textDoc } from './fixtures/word.mjs';
const id = '11111111-1111-4111-8111-111111111111';
const env = { SUPABASE_URL: 'https://synthetic.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic' };
const identity = { user: { id }, accessToken: 'synthetic-user-token' };
for (const format of ['doc', 'docx']) {
  test(`${format} evidence uses authenticated bounded original text, bound to the import hash`, async () => {
    const text = 'Știință & <script>plain text</script> — Romanian CV';
    const bytes = format === 'doc' ? textDoc(text) : docx('Știință &amp; &lt;script&gt;plain text&lt;/script&gt; — Romanian CV');
    const sourceHash = createHash('sha256').update(bytes).digest('hex');
    const calls = [];
    let denied = false, hash = sourceHash;
    const gateway = createDatabaseGateway(env, identity, async (url, init) => {
      calls.push(url);
      assert.equal(init.headers.Authorization, 'Bearer synthetic-user-token');
      if (url.includes('/rpc/')) {
        if (denied) return Response.json({ code: 'SNAPSHOT_NOT_FOUND' }, { status: 404 });
        return Response.json({ objectKey: `${id}/${id}/original.${format}`, format, sourceHash: hash });
      }
      return new Response(bytes);
    });
    const workflow = importWorkflow({ store: gateway.createImportStore(''), operations: {}, processor: () => { throw new Error('No provider or processing request'); }, userId: id, aiEnabled: false });
    const request = () => intelligenceRoute(new Request(`https://resumora.invalid/v1/intelligence/imports/${id}/source`), { workflow });
    const response = await request();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.match(response.headers.get('Content-Type'), /application\/json/);
    const data = await response.json();
    assert.deepEqual(data, { importId: id, format, sourceHash, text: format === 'doc' ? text : text + '\n' });
    assert.equal(calls.length, 3);
    assert.match(calls[0], /get_cv_import_source$/);
    assert.match(calls[1], /storage\/v1\/object\/authenticated\/cv-imports\//);
    assert.equal(calls[2], calls[0], "reauthorize the same owned source after Storage read");
    hash = 'a'.repeat(64);
    assert.equal((await request()).status, 503);
    denied = true;
    calls.length = 0;
    assert.notEqual((await request()).status, 200);
    assert.equal(calls.length, 1);
  });
}
test('Word text respects decoding and admission bounds without guessing malformed locations', () => {
  assert.equal(extractWordText('doc', textDoc('Plain ASCII', true)), 'Plain ASCII');
  assert.equal(extractWordText('docx', docx('<![CDATA[Știință <text>]]>')), 'Știință <text>\n');
  assert.throws(() => extractWordText('docx', docx('x'.repeat(40001))), /DOCUMENT_TEXT_LIMIT/);
  assert.throws(() => extractWordText('docx', docx('<!ENTITY x "bad">')), /ACTIVE_DOCUMENT_CONTENT/);
  assert.throws(() => extractWordText('doc', new Uint8Array([1, 2])), /DOCUMENT_/);
});

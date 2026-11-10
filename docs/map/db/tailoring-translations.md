---
id: db/tailoring-translations
area: db
files: ["apps/api/src/tailor/repo.ts","apps/api/src/tailor/supabase-repo.ts","apps/api/src/tailor/memory-repo.ts"]
depends_on: ["db/tailoring-tables","db/tailoring-repository","shared/cv","shared/tailoring"]
contract: false
checked_hash: 5c6e48f8
decisions: ["docs/decisions/0002-the-api-acts-as-the-signed-in-user.md", "docs/decisions/0006-last-save-wins-with-a-version-check.md"]
open: []
---
Create or refresh a translated document without replacing an original document in the same language.

- Translations reset base snapshot to translated content, clear review/score, and preserve their supplied template/letter/tone; an existing original in that language returns language_taken. `apps/api/src/tailor/supabase-repo.ts:115` -> `const fields`, `apps/api/src/tailor/supabase-repo.ts:126` -> `language_taken`
- saveTranslation makes at most two total attempts (one retry) after a competing insert (23505) or a version mismatch, then raises HTTP 409; update errors throw immediately, and successful updates increment the existing copy's version. `apps/api/src/tailor/supabase-repo.ts:121` -> `attempt < 2`, `apps/api/src/tailor/supabase-repo.ts:127` -> `version: found.data.version + 1`, `apps/api/src/tailor/supabase-repo.ts:129` -> `if (error) throw`, `apps/api/src/tailor/supabase-repo.ts:131` -> `continue`, `apps/api/src/tailor/supabase-repo.ts:136` -> `23505`, `apps/api/src/tailor/supabase-repo.ts:140` -> `ApiError(409`
- Translation updates compare the stored version before writing; competing inserts are retried on 23505. `apps/api/src/tailor/supabase-repo.ts:128` -> `eq("version"`, `apps/api/src/tailor/supabase-repo.ts:136` -> `23505`
- New translated documents use the supplied timestamp for created_at, while updates preserve the existing created_at. `apps/api/src/tailor/supabase-repo.ts:118` -> `updated_at: input.at`, `apps/api/src/tailor/supabase-repo.ts:127` -> `update`, `apps/api/src/tailor/supabase-repo.ts:134` -> `created_at: input.at`
- Fake translation writes synchronously and cannot reproduce retry exhaustion or SQL foreign-key rejection of a missing source document. `apps/api/src/tailor/memory-repo.ts:73` -> `Object.assign`, `apps/api/src/tailor/memory-repo.ts:77` -> `docs.cvs.set`, `apps/api/src/tailor/supabase-repo.ts:140` -> `version_conflict`, `supabase/migrations/20261108000000_tailoring.sql:12` -> `references public.tailored_cvs`

## Connections

- Web translation URL reaches its handler: `apps/web/src/tailor/tailored-api.ts:42` -> `/translate` -> `apps/api/src/tailor/tailored-routes.ts:81` -> `/translate`.
- Translation generation uses its prompt template: `apps/api/src/tailor/translate.ts:70` -> `translateSystemPrompt` -> `apps/api/src/tailor/translate-prompts.ts:5` -> `translateSystemPrompt`.
- Translation writes rely on the job/language unique constraint and document owner/parent policies: `apps/api/src/tailor/supabase-repo.ts:136` -> `23505` -> `supabase/migrations/20261108000000_tailoring.sql:26` -> `unique`; `apps/api/src/tailor/supabase-repo.ts:133` -> `insert` -> `supabase/migrations/20261108000000_tailoring.sql:73` -> `exists`.

## Assumptions

- Repository input content is stored without a shared-schema parse in saveTranslation; SQL content columns only require non-null JSONB. `apps/api/src/tailor/supabase-repo.ts:116` -> `content: input.content`, `supabase/migrations/20261108000000_tailoring.sql:13` -> `content`

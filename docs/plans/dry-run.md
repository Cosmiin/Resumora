# Dry run: replay of 6b0fc6e (codex-build enforcement)

Branch `dryrun/body-cap` starts at 3a21c7c, the parent of 6b0fc6e "fix(api): cap enrich request bodies at 16 KB".
Codex rebuilds it from this brief; the original commit is the reference to compare against.

## Task 1: Cap enrich request bodies at 16 KB

---
files: [apps/api/src/enrich/routes.ts, apps/api/src/enrich/routes.test.ts]
new_files: []
deps: false
size: 30
---

**Goal:** Every POST route under `/v1/enrich` rejects a request body larger than 16 KB with HTTP 413 and the error code `content_too_large`, in the same error shape the enrich routes already use. The check runs before the body is parsed and before any repository or model call. It applies both when the client declares a `content-length` over the limit and when no length is declared and the streamed body turns out to be too large.

**Acceptance tests** (add to `apps/api/src/enrich/routes.test.ts`, in the existing `/v1/enrich` describe block, using its existing helpers and fakes):
- A ~20 KB JSON body to `/v1/enrich/score` with a matching `content-length` header returns 413 with code `content_too_large`.
- The same body to `/v1/enrich/rewrite-role` without a `content-length` header returns 413.
- After both requests, the fake model has received no requests and the fake store is empty.
- All existing enrich tests still pass.

**Out of scope:** other route groups (imports, voice, cv), changing the limit elsewhere, new helpers or files, dependency changes.

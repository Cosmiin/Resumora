# Database API boundary

The Worker authenticates requests, checks CSRF/Origin for writes, validates inputs, and invokes owned RPCs. Database routines independently enforce membership, resource ownership, revision conflicts, replay identity and generation fences.

- Account and tenancy: `provision_workspace`, `set_preferences`, `record_consent`, `request_deletion`.
- Base editor: `load_base_state`, `load_base_draft`, `save_base_draft`, `base_draft_history`, `restore_base_draft`, `remove_base_cv`.
- Canonical CV: `save_profile_checkpoint`, `save_cv_checkpoint`, `restore_cv_version`.
- Imports: admission, original-source access, review saves, background task leases and settlement remain in the existing CV import RPCs.
- Languages: `document_language_context()` has no arguments; Base language reads/writes/history and proposal RPCs retain owned revision checks.
- Photos: reservation, completion, reads, deletion and expiry use owner-scoped references and private Storage policies.
- Workspace recovery: `resume`, `import-review`, and `translation-review` drafts; `questions` and `rewrite` operations.

Internal helper routines are not public client mutation APIs. Exact signatures and grants are defined in migrations and verified by native tests. The contracts and gateways in `packages/contracts/src/editor` and `apps/api/src/db` define runtime shapes.

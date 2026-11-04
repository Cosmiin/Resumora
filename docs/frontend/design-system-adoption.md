# Application design system

The maintained UI lives in `apps/web/src`: shared controls in `components/ui`, application styles in `styles.css`, and document templates in `templates`. The app owns its pine/sage/marigold tokens, responsive layouts and focus behavior.

My Profile hosts editing and enrichment. Language representations retain their own saved document state. Document template rules and PDF parity are described in [template authoring](TEMPLATE_AUTHORING.md). Current product design evidence is retained in the profile and experience guides and the CV audit documents.

Keep UI labels focused on the person's task, expose pending/error states, preserve keyboard focus through saves, and verify desktop and narrow-screen behavior when changing rendered controls.

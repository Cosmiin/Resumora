# Worker database gateway

`apps/api/src/db` owns Supabase RPC transport and response checks. Browser code calls relative Worker routes and never receives provider tokens or privileged database keys.

Requests use the verified user's access token and the private `app` schema. Gateway methods are scoped to authentication, Base CVs, imports, enrichment, languages, photos and recoverable workspace state. Errors map to stable public codes; provider/database diagnostics stay outside responses.

The gateway is not the authorization boundary by itself. SQL routines also enforce tenant membership, resource ownership and expected revisions. Immutable history remains protected from direct writes. Request replay returns the original outcome only while its owner and lifecycle are still valid.

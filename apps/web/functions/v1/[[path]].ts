/**
 * Live site only (Cloudflare Pages): every /v1/* request goes to the API Worker through the
 * `API` service binding in ../../wrangler.jsonc, so the browser sees one address for site and API.
 * In local development the Vite proxy does the same job (vite.config.ts).
 */
type Context = {
  request: Request;
  env: { API: { fetch(request: Request): Promise<Response> } };
};

export const onRequest = ({ request, env }: Context): Promise<Response> => env.API.fetch(request);

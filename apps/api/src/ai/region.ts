/** Evidence checklist, not a residency certification. There are NO approved live routes.
 * Synthetic tests may supply invented evidence to exercise rejection/selection only.
 * No env flag or caller attestation grants live generation capability.
 */
export type EnhancementProvider = 'openrouter' | 'openai';
export type EnhancementRoute = {
  provider: EnhancementProvider;
  model: string;
  providerScope: string;
  upstreamEndpoint: string; // exact OpenRouter endpoint slug; 'openai' for direct
};
export type RouteEvidence = {
  route: EnhancementRoute;
  state: 'unverified' | 'approved';
  evidenceId: string; // reference to reviewed external contract/technical evidence, no CV data
  expiresAt: string;
  countries: readonly string[];
  covers: readonly ('application' | 'gateway' | 'inference' | 'subprocessors' | 'logs')[];
};
const eu = new Set('AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE'.split(' '));
const id = /^[A-Za-z0-9_.:/-]{1,128}$/;
export function assertRouteEvidence(route: EnhancementRoute, evidence: RouteEvidence | undefined, now = Date.now()): void {
  if (!['openrouter', 'openai'].includes(route.provider) || !id.test(route.model)
    || route.model.startsWith('openrouter/') || route.model.includes(':') || !id.test(route.providerScope)
    || !id.test(route.upstreamEndpoint) || (route.provider === 'openai' && route.upstreamEndpoint !== 'openai')) throw new Error('INVALID_ROUTE');
  if (!evidence || evidence.state !== 'approved' || !id.test(evidence.evidenceId)
    || !Number.isFinite(Date.parse(evidence.expiresAt)) || Date.parse(evidence.expiresAt) <= now
    || !['provider', 'model', 'providerScope', 'upstreamEndpoint'].every(k => route[k as keyof EnhancementRoute] === evidence.route[k as keyof EnhancementRoute])
    || evidence.countries.length === 0 || evidence.countries.some(c => !eu.has(c))
    || !['application', 'gateway', 'inference', 'subprocessors', 'logs'].every(c => evidence.covers.includes(c as RouteEvidence['covers'][number]))) {
    throw new Error('EU_ROUTE_UNAPPROVED');
  }
}
export const enhancementEndpoints = {
  openrouter: 'https://eu.openrouter.ai/api/v1/chat/completions',
  openai: 'https://eu.api.openai.com/v1/chat/completions',
} as const;

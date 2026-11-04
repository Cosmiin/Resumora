/** CV extraction needs room for source quotes and complete structured fields. */
export const cvImportLimits = Object.freeze({
  outputTokens: 40_000,
  extractedCharacters: 160_000,
  responseBytes: 1_048_576,
  extractionAttemptMs: 240_000,
  extractionTotalMs: 330_000,
  processingMs: 360_000,
  leaseMs: 420_000,
  interfaceWaitMs: 450_000,
});

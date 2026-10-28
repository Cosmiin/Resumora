export async function boundedJson(response: Response, maxBytes: number, signal?: AbortSignal, allowEmpty = false): Promise<unknown> {
  if (signal?.aborted) throw new Error('RESPONSE_ABORTED');
  if (!response.body) {
    if (allowEmpty) return null;
    throw new Error('INVALID_RESPONSE');
  }
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    if (signal?.aborted) throw new Error('RESPONSE_ABORTED');
    while (true) {
      const { value, done } = await reader.read();
      if (signal?.aborted) throw new Error('RESPONSE_ABORTED');
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new Error('RESPONSE_TOO_LARGE');
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally { signal?.removeEventListener('abort', cancel); reader.releaseLock(); }
  if (allowEmpty && bytes === 0) return null;
  const buffer = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(buffer));
}

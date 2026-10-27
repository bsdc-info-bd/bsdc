/** Bounded reads: Content-Length is only an early refusal, never the limit. */
export class BodyError extends Error {
  constructor(public readonly status: 400 | 413) {
    super(status === 413 ? 'request body too large' : 'invalid request body');
  }
}

export async function readBody(request: Request, maxBytes: number): Promise<Uint8Array> {
  const length = request.headers.get('content-length');
  if (length !== null && Number(length) > maxBytes) {
    void request.body?.cancel().catch(() => undefined);
    throw new BodyError(413);
  }
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        // Do not wait for a malicious producer to finish cancellation.
        void reader.cancel().catch(() => undefined);
        throw new BodyError(413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Bound bytes before JSON parsing; reject primitives and resource-heavy shapes. */
export async function readJsonObject(
  request: Request,
  maxBytes = 8 * 1024,
): Promise<Record<string, unknown>> {
  const bytes = await readBody(request, maxBytes);
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes));
  } catch {
    throw new BodyError(400);
  }
  if (!isObject(value)) throw new BodyError(400);
  const pending: { value: unknown; depth: number }[] = [{ value, depth: 0 }];
  let nodes = 0;
  while (pending.length > 0) {
    const item = pending.pop()!;
    if (++nodes > 2048 || item.depth > 12) throw new BodyError(400);
    if (item.value !== null && typeof item.value === 'object') {
      const entries = Object.values(item.value);
      if (entries.length > 256) throw new BodyError(400);
      for (const child of entries) pending.push({ value: child, depth: item.depth + 1 });
    }
  }
  return value;
}

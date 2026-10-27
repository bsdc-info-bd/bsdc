import { describe, expect, it } from 'vitest';
import { BodyError, readBody, readJsonObject } from '../../functions/_body';

function request(value: string, length?: string): Request {
  return new Request('https://www.bsdc.info.bd/api/test', {
    method: 'POST',
    body: value,
    headers: length ? { 'content-length': length } : {},
  });
}

describe('bounded request parsing', () => {
  it('accepts a JSON object up to the exact byte limit', async () => {
    await expect(readJsonObject(request('{"ok":true}'), 11)).resolves.toEqual({ ok: true });
  });
  it.each([undefined, '1', 'invalid', '-1'])(
    'enforces actual bytes with length %s',
    async (length) => {
      await expect(readBody(request('12345', length), 4)).rejects.toMatchObject({ status: 413 });
    },
  );
  it('rejects an oversized declared length before reading', async () => {
    await expect(readBody(request('', '99999'), 4)).rejects.toBeInstanceOf(BodyError);
  });
  it('counts UTF-8 bytes, not characters', async () => {
    await expect(readBody(request('বাংলা'), 5)).rejects.toMatchObject({ status: 413 });
  });
  it.each(['null', '[]', '1', 'true', '"text"', '{', ''])(
    'refuses non-object JSON %s',
    async (body) => {
      await expect(readJsonObject(request(body))).rejects.toMatchObject({ status: 400 });
    },
  );
  it('bounds nested objects and arrays', async () => {
    await expect(
      readJsonObject(request('{"a":'.repeat(20) + '0' + '}'.repeat(20))),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      readJsonObject(request(JSON.stringify({ values: Array(257).fill(0) }))),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('cancels a chunked stream once the limit is crossed', async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(3));
      },
      cancel() {
        cancelled = true;
      },
    });
    const req = new Request('https://www.bsdc.info.bd/', {
      method: 'POST',
      body: stream,
      duplex: 'half',
    } as RequestInit);
    await expect(readBody(req, 5)).rejects.toMatchObject({ status: 413 });
    expect(cancelled).toBe(true);
  });
});

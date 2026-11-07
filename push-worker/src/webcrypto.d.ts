/**
 * The two Web Crypto parameter shapes the Worker types do not export.
 *
 * `lib.dom.d.ts` declares them; `@cloudflare/workers-types` declares only the
 * overloads. The worker only ever needs these two object literal shapes, and a
 * small local declaration is better than pulling the whole DOM library into a
 * worker build — where it would silently make `document` and `window` compile.
 */
interface EcdhKeyDeriveParams {
  name: string;
  public: CryptoKey;
}

interface HkdfParams {
  name: string;
  hash: string;
  salt: BufferSource;
  info: BufferSource;
}

import { createHmac, timingSafeEqual } from 'node:crypto';
import { SignatureVerificationError } from './errors.js';
import type { WebhookEvent } from './types.js';

/**
 * Header name used by peptide-pay to deliver HMAC-SHA256 signatures.
 *
 * Format on the wire (matches what the server sends + what the
 * WooCommerce plugin verifies):
 *
 *     x-peptidepay-signature: t=<unix_secs>,v1=<hex SHA-256>
 *
 * The `v1` HMAC is computed over `${t}.${rawBody}` so an attacker who
 * captures the body cannot replay it after the timestamp tolerance window.
 *
 * Implementation note (audit 2026-04-26): the previous version of this
 * SDK validated a different format (raw hex over body only). Server
 * always sends the `t=,v1=` envelope, so every Node integration that
 * followed the SDK README before today returned a `signature_mismatch`.
 * Fixed.
 */
export const SIGNATURE_HEADER = 'X-PeptidePay-Signature';

const TOLERANCE_SECS = 5 * 60;

export namespace Webhook {
  /**
   * Verify a webhook signature and return the parsed event.
   *
   * @param payload   Raw request body. Must be the exact bytes received — do NOT
   *                  re-serialize a parsed JSON object, as that may change the
   *                  byte order/whitespace and invalidate the signature.
   * @param signature Value of the `X-PeptidePay-Signature` header
   *                  (`t=<unix>,v1=<hex>`).
   * @param secret    Your endpoint's signing secret (starts with `whsec_`).
   * @param toleranceSecs  How far the signed timestamp may be from the local
   *                       clock (default 300s).
   * @throws SignatureVerificationError when the signature is missing, malformed,
   *         expired, or does not match.
   */
  export function constructEvent<T = unknown>(
    payload: string | Buffer,
    signature: string | string[] | null | undefined,
    secret: string,
    toleranceSecs: number = TOLERANCE_SECS,
  ): WebhookEvent<T> {
    if (!secret || typeof secret !== 'string') {
      throw new SignatureVerificationError({
        message: 'peptide-pay webhook: signing secret is required',
        code: 'missing_secret',
      });
    }
    const sig = Array.isArray(signature) ? signature[0] : signature;
    if (!sig || typeof sig !== 'string') {
      throw new SignatureVerificationError({
        message: `peptide-pay webhook: missing ${SIGNATURE_HEADER} header`,
        code: 'missing_signature',
      });
    }

    // Parse `t=<ts>,v1=<hex>` envelope. Tolerant of additional fields for
    // forward compat — we only need t + v1.
    const parts = sig.split(',').map((p) => p.trim());
    let ts: number | null = null;
    let v1: string | null = null;
    for (const part of parts) {
      const eq = part.indexOf('=');
      if (eq === -1) continue;
      const k = part.slice(0, eq);
      const v = part.slice(eq + 1);
      if (k === 't') ts = Number(v);
      else if (k === 'v1') v1 = v.trim().toLowerCase();
    }
    if (ts == null || !Number.isFinite(ts)) {
      throw new SignatureVerificationError({
        message: 'peptide-pay webhook: malformed signature header (missing t=)',
        code: 'invalid_signature',
      });
    }
    if (!v1) {
      throw new SignatureVerificationError({
        message: 'peptide-pay webhook: malformed signature header (missing v1=)',
        code: 'invalid_signature',
      });
    }

    // Replay window check
    const nowSec = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSec - ts) > toleranceSecs) {
      throw new SignatureVerificationError({
        message: `peptide-pay webhook: timestamp outside tolerance (${Math.abs(nowSec - ts)}s vs ${toleranceSecs}s)`,
        code: 'stale_timestamp',
      });
    }

    const payloadBuf =
      typeof payload === 'string' ? Buffer.from(payload, 'utf8') : payload;
    const signedInput = Buffer.concat([
      Buffer.from(`${ts}.`, 'utf8'),
      payloadBuf,
    ]);

    const expectedHex = createHmac('sha256', secret)
      .update(signedInput)
      .digest('hex');

    let expected: Buffer;
    let provided: Buffer;
    try {
      expected = Buffer.from(expectedHex, 'hex');
      provided = Buffer.from(v1, 'hex');
    } catch {
      throw new SignatureVerificationError({
        message: 'peptide-pay webhook: v1 is not valid hex',
        code: 'invalid_signature',
      });
    }

    if (
      provided.length !== expected.length ||
      !timingSafeEqual(provided, expected)
    ) {
      throw new SignatureVerificationError({
        message: 'peptide-pay webhook: signature mismatch',
        code: 'signature_mismatch',
      });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(payloadBuf.toString('utf8'));
    } catch {
      throw new SignatureVerificationError({
        message: 'peptide-pay webhook: payload is not valid JSON',
        code: 'invalid_payload',
      });
    }

    return parsed as WebhookEvent<T>;
  }
}

import type { PeptidePayErrorShape } from './types.js';

/**
 * Base error class. All SDK errors extend this.
 * The API key is never included in error output — it is redacted upstream.
 */
export class PeptidePayError extends Error {
  public readonly code?: string;
  public readonly status?: number;
  public readonly requestId?: string;

  constructor(shape: PeptidePayErrorShape) {
    super(shape.message);
    this.name = 'PeptidePayError';
    this.code = shape.code;
    this.status = shape.status;
    this.requestId = shape.requestId;
    // Restore prototype chain for `instanceof` to work across transpile targets.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 401 / 403 — bad or missing API key. */
export class AuthenticationError extends PeptidePayError {
  constructor(shape: PeptidePayErrorShape) {
    super(shape);
    this.name = 'AuthenticationError';
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

/** 400 / 404 / 422 — caller-side error (bad params, missing resource). */
export class InvalidRequestError extends PeptidePayError {
  constructor(shape: PeptidePayErrorShape) {
    super(shape);
    this.name = 'InvalidRequestError';
    Object.setPrototypeOf(this, InvalidRequestError.prototype);
  }
}

/** 5xx or any unexpected API response. */
export class APIError extends PeptidePayError {
  constructor(shape: PeptidePayErrorShape) {
    super(shape);
    this.name = 'APIError';
    Object.setPrototypeOf(this, APIError.prototype);
  }
}

/** Webhook signature verification failed. */
export class SignatureVerificationError extends PeptidePayError {
  constructor(shape: PeptidePayErrorShape) {
    super(shape);
    this.name = 'SignatureVerificationError';
    Object.setPrototypeOf(this, SignatureVerificationError.prototype);
  }
}

/**
 * Map an HTTP status + body to the appropriate error subclass.
 * Never includes the API key or Authorization header in the output.
 */
export function errorFromResponse(
  status: number,
  body: unknown,
  requestId?: string
): PeptidePayError {
  const parsed = extractApiError(body);
  const shape: PeptidePayErrorShape = {
    message: parsed.message ?? `peptide-pay request failed with status ${status}`,
    code: parsed.code,
    status,
    requestId,
  };

  if (status === 401 || status === 403) return new AuthenticationError(shape);
  if (status === 400 || status === 404 || status === 422)
    return new InvalidRequestError(shape);
  return new APIError(shape);
}

function extractApiError(body: unknown): { message?: string; code?: string } {
  if (!body || typeof body !== 'object') return {};
  const b = body as Record<string, unknown>;

  // The API returns errors in two shapes:
  //   { error: "string_code", reason?: "details", message?: "human readable" }
  //   { error: { message: "...", code: "..." } }
  // The first shape (string `error`) is what most of our routes use, so promote
  // it to the user-facing message — otherwise devs only ever saw the generic
  // "request failed with status 400" with no clue what was actually wrong.
  if (typeof b.error === 'string') {
    const reason = typeof b.reason === 'string' ? ` (${b.reason})` : '';
    const detail =
      typeof b.message === 'string'
        ? `: ${b.message as string}`
        : '';
    return {
      message: `peptide-pay: ${b.error}${reason}${detail}`,
      code: b.error,
    };
  }

  const err = (b.error ?? b) as Record<string, unknown>;
  const message =
    typeof err.message === 'string'
      ? err.message
      : typeof b.message === 'string'
        ? (b.message as string)
        : undefined;
  const code =
    typeof err.code === 'string'
      ? err.code
      : typeof b.code === 'string'
        ? (b.code as string)
        : undefined;
  return { message, code };
}

import {
  errorFromResponse,
  InvalidRequestError,
  APIError,
} from './errors.js';
import type {
  CheckoutSession,
  CheckoutSessionCreateParams,
} from './types.js';

export interface PeptidePayOptions {
  /** Override the API base URL. Defaults to `https://www.peptide-pay.com`. */
  baseUrl?: string;
  /** Optional `fetch` implementation — falls back to `globalThis.fetch`. */
  fetch?: typeof fetch;
}

// Must include the `www.` subdomain. The apex `peptide-pay.com` 308s to `www.`
// and Node's `fetch` strips the `Authorization` header on cross-origin redirect
// (per WHATWG fetch spec) — so authed calls would land at the API without their
// bearer token and 401 silently.
const DEFAULT_BASE_URL = 'https://www.peptide-pay.com';
const SDK_VERSION = '0.2.0';

/**
 * peptide-pay SDK client.
 *
 * Surface area: only what the live API actually exposes. Stripe-shaped
 * `paymentLinks.*`, `sessions.list`, and `merchants.me` were prototyped
 * here in 0.1.x but the matching server-side endpoints were never
 * shipped — calling them returned a Next.js 404 HTML page, which the
 * SDK couldn't parse, so devs only saw a generic
 * `request failed with status 404`. Removed in 0.2.0; we'll add them
 * back when the underlying routes ship.
 *
 * @example
 *   const pp = new PeptidePay('sk_live_...');
 *   const session = await pp.checkout.sessions.create({
 *     amount: 4999,
 *     currency: 'usd',
 *     success_url: 'https://example.com/ok',
 *     cancel_url: 'https://example.com/cancel',
 *   });
 *   const fresh = await pp.checkout.sessions.retrieve(session.id);
 */
export class PeptidePay {
  readonly #apiKey: string;
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;

  constructor(apiKey: string, opts: PeptidePayOptions = {}) {
    if (!apiKey || typeof apiKey !== 'string') {
      throw new InvalidRequestError({
        message: 'peptide-pay: apiKey is required',
        code: 'missing_api_key',
      });
    }
    if (!apiKey.startsWith('sk_test_') && !apiKey.startsWith('sk_live_')) {
      throw new InvalidRequestError({
        message:
          'peptide-pay: apiKey must start with `sk_test_` or `sk_live_`',
        code: 'invalid_api_key_prefix',
      });
    }

    const chosenFetch = opts.fetch ?? globalThis.fetch;
    if (typeof chosenFetch !== 'function') {
      throw new APIError({
        message:
          'peptide-pay: global fetch is not available. Use Node >= 18 or pass `fetch` in options.',
        code: 'fetch_unavailable',
      });
    }

    this.#apiKey = apiKey;
    this.#baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.#fetch = chosenFetch;

    // Bind namespaced resources so `pp.checkout.sessions.create(...)` works
    // whether called bound or destructured.
    this.checkout = {
      sessions: {
        create: (params) => this.#createSession(params),
        retrieve: (id) => this.#retrieveSession(id),
      },
    };
  }

  // ───────────── Public namespaces (Stripe-shaped) ─────────────

  readonly checkout: {
    sessions: {
      create: (params: CheckoutSessionCreateParams) => Promise<CheckoutSession>;
      retrieve: (id: string) => Promise<CheckoutSession>;
    };
  };

  // ───────────── Resource implementations ─────────────

  #createSession(params: CheckoutSessionCreateParams): Promise<CheckoutSession> {
    this.#requireString(params?.currency, 'currency');
    this.#requireString(params?.success_url, 'success_url');
    this.#requireString(params?.cancel_url, 'cancel_url');
    if (!Number.isFinite(params?.amount) || params.amount <= 0) {
      throw new InvalidRequestError({
        message: 'peptide-pay: amount must be a positive number',
        code: 'invalid_amount',
      });
    }
    return this.#request<CheckoutSession>('POST', '/api/v1/checkout/init', params);
  }

  #retrieveSession(id: string): Promise<CheckoutSession> {
    this.#requireString(id, 'id');
    return this.#request<CheckoutSession>(
      'GET',
      `/api/v1/sessions/${encodeURIComponent(id)}`
    );
  }

  // ───────────── HTTP core ─────────────

  async #request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.#baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.#apiKey}`,
      Accept: 'application/json',
      'User-Agent': `peptide-pay-node/${SDK_VERSION}`,
    };

    let init: RequestInit = { method, headers };
    if (body !== undefined && method !== 'GET') {
      headers['Content-Type'] = 'application/json';
      init = { ...init, body: JSON.stringify(body) };
    }

    let response: Response;
    try {
      response = await this.#fetch(url, init);
    } catch {
      throw new APIError({
        message: `peptide-pay: network error reaching ${safeUrl(url)}`,
        code: 'network_error',
      });
    }

    const requestId =
      response.headers.get('x-request-id') ??
      response.headers.get('request-id') ??
      undefined;

    const text = await response.text();
    let parsed: unknown = undefined;
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        // Non-JSON body — only an error if the status is non-2xx.
      }
    }

    if (!response.ok) {
      throw errorFromResponse(response.status, parsed, requestId);
    }

    return parsed as T;
  }

  #requireString(value: unknown, name: string): asserts value is string {
    if (typeof value !== 'string' || value.length === 0) {
      throw new InvalidRequestError({
        message: `peptide-pay: \`${name}\` is required`,
        code: 'missing_required_param',
      });
    }
  }
}

/** Strip query string from a URL for safe error messages (never leaks tokens). */
function safeUrl(url: string): string {
  const q = url.indexOf('?');
  return q === -1 ? url : url.slice(0, q);
}

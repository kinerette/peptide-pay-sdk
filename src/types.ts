/**
 * Shared type definitions for the peptide-pay SDK.
 * Designed to mirror Stripe's shape so devs can copy/paste Stripe patterns.
 *
 * Surface intentionally narrow: we only export types for endpoints that
 * are actually live on the API. PaymentLink, Merchant, and the list-style
 * `ApiList<T>` types lived here in 0.1.x but their server-side routes
 * were never shipped, so the methods that returned them were removed
 * from the client in 0.2.0.
 */

// ───────────────────────── Checkout Sessions ─────────────────────────

export type CheckoutSessionStatus = 'pending' | 'paid' | 'expired' | 'failed';

export interface CheckoutSession {
  id: string;
  status: CheckoutSessionStatus;
  /** Amount in the smallest unit (e.g. cents for USD, micro-USDC for USDC). */
  amount: number;
  currency: string;
  /** Hosted checkout URL — redirect the customer here. */
  url: string;
  created_at: string;
  expires_at: string;
  paid_at?: string | null;
  /** On-chain transaction id once paid. */
  txid?: string | null;
  customer_email?: string | null;
  success_url?: string | null;
  cancel_url?: string | null;
  metadata?: Record<string, string> | null;
}

export interface CheckoutSessionCreateParams {
  amount: number;
  currency: string;
  success_url: string;
  cancel_url: string;
  metadata?: Record<string, string>;
  customer_email?: string;
  /**
   * BCP 47 primary-language tag for the hosted checkout UI.
   * When set, overrides the customer's browser Accept-Language so the
   * checkout renders in the merchant's store language.
   *
   * Supported values: 'en' | 'fr' | 'de' | 'it' | 'es' | 'nl' |
   *   'pt' | 'ru' | 'pl' | 'tr' | 'zh' | 'ja' | 'ko'
   *
   * Default when absent: 'en' (Accept-Language fallback on the server).
   *
   * @example
   *   // German store → always show checkout in German
   *   pp.checkout.sessions.create({ ..., locale: 'de' })
   */
  locale?: 'en' | 'fr' | 'de' | 'it' | 'es' | 'nl' | 'pt' | 'ru' | 'pl' | 'tr' | 'zh' | 'ja' | 'ko';
}

// ───────────────────────── Webhooks ─────────────────────────

export type WebhookEventType =
  | 'order.paid'
  | 'checkout.session.created'
  | 'checkout.session.completed'
  | 'checkout.session.expired'
  | 'checkout.session.failed';

export interface WebhookEvent<T = unknown> {
  id: string;
  type: WebhookEventType;
  created_at: string;
  livemode: boolean;
  data: {
    object: T;
  };
}

// ───────────────────────── Errors ─────────────────────────

export interface PeptidePayErrorShape {
  message: string;
  code?: string;
  status?: number;
  requestId?: string;
}

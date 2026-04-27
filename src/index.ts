/**
 * peptide-pay — Official JavaScript/TypeScript SDK.
 * Stripe-compatible payment API for high-risk merchants.
 *
 * @packageDocumentation
 */

export { PeptidePay } from './client.js';
export type { PeptidePayOptions } from './client.js';
export { Webhook, SIGNATURE_HEADER } from './webhooks.js';

export {
  PeptidePayError,
  AuthenticationError,
  InvalidRequestError,
  APIError,
  SignatureVerificationError,
} from './errors.js';

export type {
  // Checkout
  CheckoutSession,
  CheckoutSessionCreateParams,
  CheckoutSessionStatus,
  // Webhooks
  WebhookEvent,
  WebhookEventType,
  // Misc
  PeptidePayErrorShape,
} from './types.js';

// Default export so that `import PeptidePay from 'peptide-pay'` also works,
// matching Stripe's DX (`import Stripe from 'stripe'`).
import { PeptidePay } from './client.js';
export default PeptidePay;

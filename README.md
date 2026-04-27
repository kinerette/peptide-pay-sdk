# peptide-pay

Official JavaScript / TypeScript SDK for [peptide-pay.com](https://peptide-pay.com) — a Stripe-compatible payment API for high-risk merchants (peptides, research chemicals, supplements, nutra). USDC / crypto on-ramp under the hood.

- Zero runtime dependencies (uses Node 18+ `fetch` + built-in `crypto`).
- Ships both ESM and CommonJS builds with full TypeScript types.
- API surface mirrors Stripe's — most Stripe code paths port by changing two lines.

> Requires Node.js **18 or later**.

---

## Install

```bash
npm install peptide-pay
# or
pnpm add peptide-pay
# or
yarn add peptide-pay
```

## Quickstart

```ts
import { PeptidePay } from 'peptide-pay';

const pp = new PeptidePay(process.env.PEPTIDE_PAY_SECRET_KEY!); // sk_live_... or sk_test_...

const session = await pp.checkout.sessions.create({
  amount: 4999,
  currency: 'usd',
  success_url: 'https://your-site.com/success?sid={CHECKOUT_SESSION_ID}',
  cancel_url: 'https://your-site.com/cancel',
  customer_email: 'buyer@example.com',
  metadata: { order_id: 'ord_123' },
});

// Redirect the customer to the hosted checkout page.
res.redirect(303, session.url);
```

## Migrating from Stripe

If you already have a Stripe checkout flow, the SDK shape is deliberately identical. Two changes and you're done:

```diff
- import Stripe from 'stripe';
- const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
+ import { PeptidePay } from 'peptide-pay';
+ const stripe = new PeptidePay(process.env.PEPTIDE_PAY_SECRET_KEY!);

  const session = await stripe.checkout.sessions.create({
    amount: 4999,
    currency: 'usd',
    success_url: 'https://your-site.com/ok',
    cancel_url: 'https://your-site.com/cancel',
  });
```

The `amount` / `currency` / `success_url` / `cancel_url` / `metadata` / `customer_email` fields match Stripe's shape. Line items are handled server-side by peptide-pay (single aggregate amount); this is the main practical difference.

## Webhooks

peptide-pay signs every webhook with an HMAC-SHA256 secret. Verify the signature before trusting the payload:

```ts
import express from 'express';
import { Webhook, SIGNATURE_HEADER } from 'peptide-pay';

const app = express();

// IMPORTANT: use the raw body — re-serialized JSON will not match the signature.
app.post(
  '/webhooks/peptide-pay',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    try {
      const event = Webhook.constructEvent(
        req.body,
        req.header(SIGNATURE_HEADER),
        process.env.PEPTIDE_PAY_WEBHOOK_SECRET!
      );

      switch (event.type) {
        case 'checkout.session.completed':
          // Fulfill the order.
          break;
        case 'checkout.session.expired':
        case 'checkout.session.failed':
          // Release reserved inventory, etc.
          break;
      }

      res.json({ received: true });
    } catch (err) {
      res.status(400).send(`Invalid signature: ${(err as Error).message}`);
    }
  }
);
```

## API Reference

### `new PeptidePay(apiKey, opts?)`

- `apiKey` — `sk_test_...` or `sk_live_...`.
- `opts.baseUrl` — defaults to `https://www.peptide-pay.com`. The apex
  domain 308-redirects to `www`, and Node's `fetch` strips the
  `Authorization` header on cross-origin redirects (per WHATWG fetch
  spec) — so the default MUST include `www.`.
- `opts.fetch` — inject a custom `fetch` (e.g. for tests).

### Checkout sessions

| Method | HTTP |
| --- | --- |
| `pp.checkout.sessions.create(params)` | `POST /api/v1/checkout/init` |
| `pp.checkout.sessions.retrieve(id)`   | `GET /api/v1/sessions/{id}` |

> Surface area is intentionally narrow. Payment Links, list endpoints,
> and `pp.merchants.me()` lived in the 0.1.x SDK but the matching
> server-side routes were never shipped. They're removed in 0.2.0; we'll
> add them back when the routes are live.

### Errors

All errors thrown by the SDK extend `PeptidePayError`:

- `AuthenticationError` — invalid or missing API key (401 / 403).
- `InvalidRequestError` — bad parameters or missing resource (400 / 404 / 422).
- `APIError` — 5xx or unexpected response.
- `SignatureVerificationError` — webhook signature mismatch.

All error instances expose `{ message, code?, status?, requestId? }`. The API key is never included in error output.

## Docs

Full API reference: [https://peptide-pay.com/docs](https://peptide-pay.com/docs)

## License

MIT © kinerette

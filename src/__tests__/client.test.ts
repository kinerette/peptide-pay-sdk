import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  PeptidePay,
  Webhook,
  SIGNATURE_HEADER,
  SignatureVerificationError,
  InvalidRequestError,
  AuthenticationError,
} from '../index.js';

describe('PeptidePay client', () => {
  const apiKey = 'sk_test_abcdef123456';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('instantiates with a valid key and exposes checkout.sessions', () => {
    const pp = new PeptidePay(apiKey);
    expect(pp).toBeInstanceOf(PeptidePay);
    expect(pp.checkout.sessions.create).toBeTypeOf('function');
    expect(pp.checkout.sessions.retrieve).toBeTypeOf('function');
    // 0.2.0 removed the paymentLinks / merchants namespaces — their
    // server-side routes were never shipped. Tests here intentionally
    // do NOT reference them so the suite stays green.
  });

  it('rejects API keys without the sk_test_/sk_live_ prefix', () => {
    expect(() => new PeptidePay('bogus_key')).toThrow(InvalidRequestError);
    expect(() => new PeptidePay('')).toThrow(InvalidRequestError);
  });

  it('checkout.sessions.create POSTs to /api/v1/checkout/init with bearer auth', async () => {
    const fakeSession = {
      id: 'cs_test_1',
      status: 'pending',
      amount: 4999,
      currency: 'usd',
      url: 'https://peptide-pay.com/c/cs_test_1',
      created_at: '2026-04-19T00:00:00Z',
      expires_at: '2026-04-19T00:30:00Z',
    };

    const mockFetch = vi.fn(async () =>
      new Response(JSON.stringify(fakeSession), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    const pp = new PeptidePay(apiKey, { fetch: mockFetch as unknown as typeof fetch });
    const session = await pp.checkout.sessions.create({
      amount: 4999,
      currency: 'usd',
      success_url: 'https://example.com/ok',
      cancel_url: 'https://example.com/no',
      metadata: { order_id: 'o_1' },
    });

    expect(session).toEqual(fakeSession);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = mockFetch.mock.calls[0]!;
    expect(calledUrl).toBe('https://www.peptide-pay.com/api/v1/checkout/init');
    expect(calledInit?.method).toBe('POST');
    const headers = calledInit?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${apiKey}`);
    expect(headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(calledInit?.body as string);
    expect(body.amount).toBe(4999);
    expect(body.success_url).toBe('https://example.com/ok');
  });

  it('checkout.sessions.retrieve GETs /api/v1/sessions/{id}', async () => {
    const mockFetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          id: 'cs_test_2',
          status: 'paid',
          amount: 100,
          currency: 'usd',
          url: 'x',
          created_at: 'x',
          expires_at: 'x',
        }),
        { status: 200 }
      )
    );
    const pp = new PeptidePay(apiKey, { fetch: mockFetch as unknown as typeof fetch });
    await pp.checkout.sessions.retrieve('cs_test_2');
    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe('https://www.peptide-pay.com/api/v1/sessions/cs_test_2');
    expect(init?.method).toBe('GET');
    expect(init?.body).toBeUndefined();
  });

  it('maps a 401 response to AuthenticationError', async () => {
    const mockFetch = vi.fn(async () =>
      new Response(
        JSON.stringify({ error: { message: 'bad key', code: 'bad_key' } }),
        { status: 401 }
      )
    );
    const pp = new PeptidePay(apiKey, { fetch: mockFetch as unknown as typeof fetch });
    // Use the only authed call we still ship in 0.2.0: retrieve.
    await expect(
      pp.checkout.sessions.retrieve('cs_doesnt_matter'),
    ).rejects.toBeInstanceOf(AuthenticationError);
  });
});

describe('Webhook.constructEvent', () => {
  const secret = 'whsec_example_secret';
  const event = { id: 'evt_1', type: 'checkout.session.completed', data: { object: {} } };
  const payload = JSON.stringify(event);
  const validSig = createHmac('sha256', secret).update(payload).digest('hex');

  it('verifies a valid HMAC-SHA256 signature and returns the parsed event', () => {
    const parsed = Webhook.constructEvent(payload, validSig, secret);
    expect(parsed.id).toBe('evt_1');
    expect(parsed.type).toBe('checkout.session.completed');
  });

  it('throws SignatureVerificationError when the signature is wrong', () => {
    expect(() =>
      Webhook.constructEvent(payload, 'deadbeef'.repeat(8), secret)
    ).toThrow(SignatureVerificationError);
  });

  it('throws when the header is missing', () => {
    expect(() =>
      Webhook.constructEvent(payload, undefined, secret)
    ).toThrow(SignatureVerificationError);
  });

  it('exports the expected header name', () => {
    expect(SIGNATURE_HEADER).toBe('X-PeptidePay-Signature');
  });
});

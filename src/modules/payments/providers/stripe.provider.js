// src/modules/payments/providers/stripe.provider.js
import Stripe from 'stripe';
import PaymentProvider from './payment.interface.js';
import { getPublicAppUrl, resolvePublicUrl } from './provider-config.js';

let stripeClient = null;

const getStripeClient = () => {
  const secretKey = String(process.env.STRIPE_SECRET_KEY || '').trim();
  if (!secretKey) {
    throw new Error('Stripe API key not configured');
  }

  if (!stripeClient) {
    stripeClient = new Stripe(secretKey);
  }

  return stripeClient;
};

export default class StripeProvider extends PaymentProvider {
  async createPayment({ amount, currency, metadata }) {
    const stripe = getStripeClient();
    const appUrl = getPublicAppUrl();
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [{
        price_data: {
          currency,
          product_data: { name: metadata.courseTitle },
          unit_amount: Math.round(amount * 100)
        },
        quantity: 1
      }],
      success_url: `${appUrl}/payments/confirm?provider=stripe&reference={CHECKOUT_SESSION_ID}`,
      cancel_url: resolvePublicUrl(process.env.STRIPE_CANCEL_URL, '/courses'),
      metadata
    });

    return {
      checkoutUrl: session.url,
      reference: session.id,
      provider: 'stripe',
      metadata
    };
  }

  async verifyPayment(reference) {
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(reference);
    return session.payment_status === 'paid';
  }

  async handleWebhook(event) {
    // Implement Stripe webhook verification here
    return true;
  }

  async createRefund({ reference, amount, metadata }) {
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(reference);
    const paymentIntentId =
      typeof session?.payment_intent === 'string'
        ? session.payment_intent
        : session?.payment_intent?.id;

    if (!paymentIntentId) {
      throw new Error('Stripe payment intent not found for refund');
    }

    const numericAmount = Number(amount);
    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      ...(Number.isFinite(numericAmount) && numericAmount > 0
        ? { amount: Math.round(numericAmount * 100) }
        : {}),
      reason: 'requested_by_customer',
      metadata
    });

    return {
      reference: refund.id,
      status: refund.status,
      raw: refund
    };
  }
}

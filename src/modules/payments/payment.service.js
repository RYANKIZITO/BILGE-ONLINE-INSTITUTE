// src/modules/payments/payment.service.js
import StripeProvider from './providers/stripe.provider.js';
import PaypalProvider from './providers/paypal.provider.js';
import PesapalProvider from './providers/pesapal.provider.js';

const providers = {
  stripe: new StripeProvider(),
  pesapal: new PesapalProvider(),
  paypal: new PaypalProvider()
};

export class PaymentService {
  static getProvider(name) {
    if (!providers[name]) {
      throw new Error(`Payment provider ${name} not supported`);
    }
    return providers[name];
  }

  static async initiate(providerName, data) {
    const provider = this.getProvider(providerName);
    return provider.createPayment(data);
  }

  static async verify(providerName, reference, context) {
    const provider = this.getProvider(providerName);
    return provider.verifyPayment(reference, context);
  }

  static async webhook(providerName, payload) {
    const provider = this.getProvider(providerName);
    return provider.handleWebhook(payload);
  }

  static async refund(providerName, data) {
    const provider = this.getProvider(providerName);
    return provider.createRefund(data);
  }
}

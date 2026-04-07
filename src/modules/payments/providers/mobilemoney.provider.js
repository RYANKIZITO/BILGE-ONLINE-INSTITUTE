// src/modules/payments/providers/mobilemoney.provider.js
import PaymentProvider from './payment.interface.js';

export default class MobileMoneyProvider extends PaymentProvider {
  async createPayment({ phone, amount }) {
    return {
      reference: `MM-${Date.now()}`,
      message: 'STK push initiated'
    };
  }

  async verifyPayment(reference) {
    return true;
  }

  async handleWebhook(payload) {
    return true;
  }
}

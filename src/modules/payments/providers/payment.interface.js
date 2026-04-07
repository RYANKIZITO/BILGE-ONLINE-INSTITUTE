// src/modules/payments/providers/payment.interface.js
export default class PaymentProvider {
  async createPayment(data) {
    throw new Error('createPayment() not implemented');
  }

  async verifyPayment(reference) {
    throw new Error('verifyPayment() not implemented');
  }

  async handleWebhook(payload) {
    throw new Error('handleWebhook() not implemented');
  }

  async createRefund(data) {
    throw new Error('createRefund() not implemented');
  }
}

import { env } from "../config/env.js";

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
}

export interface OrderEmailData {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  items: Array<{ name: string; quantity: number; price: number }>;
  total: number;
  shippingAddress: string;
}

export interface EmailService {
  sendEmail(options: EmailOptions): Promise<void>;
  sendOrderConfirmation(data: OrderEmailData): Promise<void>;
  sendOrderShipped(data: OrderEmailData & { trackingNumber?: string }): Promise<void>;
  sendOrderRefunded(data: OrderEmailData & { refundAmount: number }): Promise<void>;
}

class DevEmailService implements EmailService {
  async sendEmail(options: EmailOptions): Promise<void> {
    console.log("[DEV EMAIL SERVICE]", {
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html ? "[HTML CONTENT]" : undefined,
    });
  }

  async sendOrderConfirmation(data: OrderEmailData): Promise<void> {
    await this.sendEmail({
      to: data.customerEmail,
      subject: `Order Confirmation - ${data.orderNumber}`,
      text: `Dear ${data.customerName},\n\nYour order ${data.orderNumber} has been confirmed.\n\nTotal: ₹${data.total}\n\nThank you for shopping with Renu's Collections!`
    });
  }

  async sendOrderShipped(data: OrderEmailData & { trackingNumber?: string }): Promise<void> {
    await this.sendEmail({
      to: data.customerEmail,
      subject: `Order Shipped - ${data.orderNumber}`,
      text: `Dear ${data.customerName},\n\nYour order ${data.orderNumber} has been shipped.\n${data.trackingNumber ? `Tracking Number: ${data.trackingNumber}\n` : ""}Thank you for shopping with Renu's Collections!`
    });
  }

  async sendOrderRefunded(data: OrderEmailData & { refundAmount: number }): Promise<void> {
    await this.sendEmail({
      to: data.customerEmail,
      subject: `Refund Processed - ${data.orderNumber}`,
      text: `Dear ${data.customerName},\n\nA refund of ₹${data.refundAmount} has been processed for your order ${data.orderNumber}.\n\nThank you for shopping with Renu's Collections!`
    });
  }
}

class ProductionEmailService implements EmailService {
  async sendEmail(options: EmailOptions): Promise<void> {
    // TODO: Integrate with actual email service (SendGrid, AWS SES, etc.)
    // For now, fall back to dev service
    console.log("[PRODUCTION EMAIL SERVICE - NOT CONFIGURED]", {
      to: options.to,
      subject: options.subject,
    });
    throw new Error("Email service not configured");
  }

  async sendOrderConfirmation(data: OrderEmailData): Promise<void> {
    const html = `
      <h2>Order Confirmation</h2>
      <p>Dear ${data.customerName},</p>
      <p>Your order <strong>${data.orderNumber}</strong> has been confirmed.</p>
      <h3>Order Summary</h3>
      <ul>
        ${data.items.map(item => `<li>${item.name} x ${item.quantity} - ₹${item.price}</li>`).join('')}
      </ul>
      <p><strong>Total: ₹${data.total}</strong></p>
      <p>Thank you for shopping with Renu's Collections!</p>
    `;
    
    await this.sendEmail({
      to: data.customerEmail,
      subject: `Order Confirmation - ${data.orderNumber}`,
      html,
      text: `Order ${data.orderNumber} confirmed. Total: ₹${data.total}`,
    });
  }

  async sendOrderShipped(data: OrderEmailData & { trackingNumber?: string }): Promise<void> {
    const html = `
      <h2>Order Shipped</h2>
      <p>Dear ${data.customerName},</p>
      <p>Your order <strong>${data.orderNumber}</strong> has been shipped.</p>
      ${data.trackingNumber ? `<p>Tracking Number: <strong>${data.trackingNumber}</strong></p>` : ''}
      <p>Thank you for shopping with Renu's Collections!</p>
    `;
    
    await this.sendEmail({
      to: data.customerEmail,
      subject: `Order Shipped - ${data.orderNumber}`,
      html,
      text: `Order ${data.orderNumber} shipped.${data.trackingNumber ? ` Tracking: ${data.trackingNumber}` : ''}`,
    });
  }

  async sendOrderRefunded(data: OrderEmailData & { refundAmount: number }): Promise<void> {
    const html = `
      <h2>Refund Processed</h2>
      <p>Dear ${data.customerName},</p>
      <p>A refund of <strong>₹${data.refundAmount}</strong> has been processed for your order <strong>${data.orderNumber}</strong>.</p>
      <p>The refund will be credited to your original payment method within 5-7 business days.</p>
      <p>Thank you for shopping with Renu's Collections!</p>
    `;
    
    await this.sendEmail({
      to: data.customerEmail,
      subject: `Refund Processed - ${data.orderNumber}`,
      html,
      text: `Refund of ₹${data.refundAmount} processed for order ${data.orderNumber}`,
    });
  }
}

let emailServiceInstance: EmailService;

export function getEmailService(): EmailService {
  if (!emailServiceInstance) {
    // Use production service if SMTP is configured
    if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
      emailServiceInstance = new ProductionEmailService();
    } else {
      emailServiceInstance = new DevEmailService();
    }
  }
  return emailServiceInstance;
}

export async function sendOrderConfirmation(data: OrderEmailData): Promise<void> {
  const service = getEmailService();
  await service.sendOrderConfirmation(data);
}

export async function sendOrderShipped(data: OrderEmailData & { trackingNumber?: string }): Promise<void> {
  const service = getEmailService();
  await service.sendOrderShipped(data);
}

export async function sendOrderRefunded(data: OrderEmailData & { refundAmount: number }): Promise<void> {
  const service = getEmailService();
  await service.sendOrderRefunded(data);
}

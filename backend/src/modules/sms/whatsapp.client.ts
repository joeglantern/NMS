import { FastifyInstance } from 'fastify';

export interface WhatsAppSendResult {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
}

/**
 * Thin wrapper around Meta's WhatsApp Cloud API (graph.facebook.com).
 *
 * Business-initiated messages (which all EOC alerts are) must use a pre-approved
 * message *template*. We use a single template that takes the whole alert text as
 * its one body parameter ({{1}}), so the existing SMS templates render the content
 * and WhatsApp just carries it. Credentials come from env; never hard-coded.
 *
 * Setup required to activate (Meta Business):
 *   1. Create a WhatsApp Business app + phone number → get the Phone Number ID.
 *   2. Generate a permanent System User access token with whatsapp_business_messaging.
 *   3. Create & get approval for a template (category UTILITY) with one body variable.
 *   4. Set WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TOKEN, WHATSAPP_TEMPLATE_NAME in .env.
 */
export class WhatsAppClient {
  private base: string;
  private version: string;
  private phoneNumberId: string;
  private token: string;
  private templateName: string;
  private templateLang: string;

  constructor(app: FastifyInstance) {
    this.base = (app.config.WHATSAPP_BASE_URL || 'https://graph.facebook.com').replace(/\/$/, '');
    this.version = app.config.WHATSAPP_API_VERSION || 'v21.0';
    this.phoneNumberId = app.config.WHATSAPP_PHONE_NUMBER_ID || '';
    this.token = app.config.WHATSAPP_TOKEN || '';
    this.templateName = app.config.WHATSAPP_TEMPLATE_NAME || '';
    this.templateLang = app.config.WHATSAPP_TEMPLATE_LANG || 'en';
  }

  /** True when the credentials + template are present. */
  get configured(): boolean {
    return !!this.phoneNumberId && !!this.token && !!this.templateName;
  }

  private get endpoint(): string {
    return `${this.base}/${this.version}/${this.phoneNumberId}/messages`;
  }

  /** Send the alert text to one number using the approved template's single body param. */
  async sendTemplate(msisdn: string, bodyText: string): Promise<WhatsAppSendResult> {
    if (!this.configured) return { ok: false, error: 'WhatsApp not configured' };
    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: msisdn,
          type: 'template',
          template: {
            name: this.templateName,
            language: { code: this.templateLang },
            components: [
              { type: 'body', parameters: [{ type: 'text', text: bodyText }] },
            ],
          },
        }),
        signal: AbortSignal.timeout(15_000),
      });

      const data: any = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data?.messages) && data.messages[0]?.id) {
        return { ok: true, providerMessageId: String(data.messages[0].id) };
      }
      const errMsg = data?.error?.message || `WhatsApp code ${res.status}`;
      return { ok: false, error: errMsg };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'WhatsApp request failed' };
    }
  }
}

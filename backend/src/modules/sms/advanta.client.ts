import { FastifyInstance } from 'fastify';

export interface AdvantaSendResult {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
}

/**
 * Thin wrapper around the Advanta / Millenium Bulk SMS API.
 * Docs: https://quicksms.advantasms.com  —  POST JSON { apikey, partnerID, message, shortcode, mobile }
 * Credentials come from env (see config/env.ts): never hard-coded.
 */
export class AdvantaClient {
  private base: string;
  private apiKey: string;
  private partnerID: string;
  private senderId: string;

  constructor(app: FastifyInstance) {
    this.base = (app.config.ADVANTA_BASE_URL || 'https://quicksms.advantasms.com').replace(/\/$/, '');
    this.apiKey = app.config.ADVANTA_API_KEY || '';
    this.partnerID = app.config.ADVANTA_PARTNER_ID || '';
    this.senderId = app.config.ADVANTA_SENDER_ID || 'EOC';
  }

  /** True when the provider credentials are present. */
  get configured(): boolean {
    return !!this.apiKey && !!this.partnerID;
  }

  async sendOne(mobile: string, message: string): Promise<AdvantaSendResult> {
    if (!this.configured) return { ok: false, error: 'SMS provider not configured' };
    try {
      const res = await fetch(`${this.base}/api/services/sendsms/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apikey: this.apiKey,
          partnerID: this.partnerID,
          message,
          shortcode: this.senderId,
          mobile,
        }),
        signal: AbortSignal.timeout(15_000),
      });

      const data: any = await res.json().catch(() => ({}));
      // Provider returns { responses: [ { "respose-code": 200, messageid, ... } ] }  (note their typo)
      const r = Array.isArray(data?.responses) ? data.responses[0] : data;
      const code = Number(r?.['respose-code'] ?? r?.['response-code'] ?? res.status);
      if (code === 200) {
        return { ok: true, providerMessageId: r?.messageid ? String(r.messageid) : undefined };
      }
      return { ok: false, error: r?.['response-description'] || `Provider code ${code}` };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'SMS request failed' };
    }
  }

  async getBalance(): Promise<{ ok: boolean; balance?: string; error?: string }> {
    if (!this.configured) return { ok: false, error: 'SMS provider not configured' };
    try {
      const res = await fetch(`${this.base}/api/services/getbalance/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apikey: this.apiKey, partnerID: this.partnerID }),
        signal: AbortSignal.timeout(15_000),
      });
      const data: any = await res.json().catch(() => ({}));
      const balance = data?.credit ?? data?.balance ?? data?.credits ?? null;
      return { ok: true, balance: balance != null ? String(balance) : JSON.stringify(data) };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Balance request failed' };
    }
  }
}

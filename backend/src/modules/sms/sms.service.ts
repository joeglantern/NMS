import { FastifyInstance } from 'fastify';
import { Role } from '../../shared/types/index.js';
import { AdvantaClient } from './advanta.client.js';

export interface RecipientSpec {
  numbers?: string[];
  contactGroups?: string[];
  userRoles?: Role[];
  partnerNiche?: string; // 'ALL' or a niche tag e.g. 'GBV' / 'MCI'
}

export interface SendMeta {
  category?: string;      // MANUAL | AUTO_PARTNER | SURVEILLANCE
  groupLabel?: string;
  incidentId?: string;
  sentById?: string;
}

const DEFAULT_TEMPLATES = [
  {
    key: 'GBV',
    label: 'GBV partner alert',
    body: 'EOC ALERT: A GBV case ({{caseNumber}}) has been logged at {{location}}. Please respond as an assigned GBV partner.',
  },
  {
    key: 'MCI',
    label: 'MCI partner alert',
    body: 'EOC ALERT: Mass Casualty Incident ({{caseNumber}}) at {{location}}, approx {{count}} casualties. Your MCI support is requested.',
  },
  {
    key: 'SURVEILLANCE',
    label: 'Surveillance alert',
    body: 'EOC SURVEILLANCE ALERT: {{nature}} reported at {{location}} (case {{caseNumber}}). Please review and advise.',
  },
];

/** Normalize a Kenyan number to 2547XXXXXXXX / 2541XXXXXXXX; returns null if invalid. */
export function normalizeMsisdn(raw: string): string | null {
  if (!raw) return null;
  let s = raw.replace(/[^0-9+]/g, '').replace(/^\+/, '');
  if (s.startsWith('0')) s = '254' + s.slice(1);
  else if (s.startsWith('7') || s.startsWith('1')) s = '254' + s;
  return /^254\d{9}$/.test(s) ? s : null;
}

export class SmsService {
  private advanta: AdvantaClient;

  constructor(private app: FastifyInstance) {
    this.advanta = new AdvantaClient(app);
  }

  get configured(): boolean {
    return this.advanta.configured;
  }

  // ── Templates ──────────────────────────────────────────────────────────────
  async ensureDefaultTemplates(): Promise<void> {
    for (const t of DEFAULT_TEMPLATES) {
      await this.app.prisma.smsTemplate.upsert({ where: { key: t.key }, update: {}, create: t });
    }
  }

  async getTemplates() {
    await this.ensureDefaultTemplates();
    return this.app.prisma.smsTemplate.findMany({ orderBy: { key: 'asc' } });
  }

  updateTemplate(key: string, body: string) {
    return this.app.prisma.smsTemplate.update({ where: { key }, data: { body } });
  }

  renderTemplate(body: string, vars: Record<string, string | number | undefined>): string {
    return body
      .replace(/\{\{(\w+)\}\}/g, (_m, k) => {
        const v = vars[k];
        return v === undefined || v === null ? '' : String(v);
      })
      .trim();
  }

  // ── Recipient resolution ─────────────────────────────────────────────────────
  async resolveRecipients(spec: RecipientSpec): Promise<string[]> {
    const set = new Set<string>();
    const add = (raw?: string | null) => {
      const n = raw ? normalizeMsisdn(raw) : null;
      if (n) set.add(n);
    };

    (spec.numbers ?? []).forEach(add);

    if (spec.contactGroups?.length) {
      const contacts = await this.app.prisma.smsContact.findMany({
        where: { group: { in: spec.contactGroups }, isActive: true },
      });
      contacts.forEach((c) => add(c.phone));
    }

    if (spec.userRoles?.length) {
      const users = await this.app.prisma.user.findMany({
        where: { role: { in: spec.userRoles }, isActive: true, phone: { not: null } },
        select: { phone: true },
      });
      users.forEach((u) => add(u.phone));
    }

    if (spec.partnerNiche) {
      const partners = await this.app.prisma.agency.findMany({
        where: { type: 'PARTNER', isActive: true },
        select: { contactInfo: true },
      });
      for (const p of partners) {
        const info = (p.contactInfo ?? {}) as Record<string, any>;
        const phone = typeof info.phone === 'string' ? info.phone : null;
        if (!phone) continue;
        if (spec.partnerNiche === 'ALL') {
          add(phone);
          continue;
        }
        const niches = Array.isArray(info.niches) ? info.niches.map(String) : [];
        if (niches.includes(spec.partnerNiche)) add(phone);
      }
    }

    return [...set];
  }

  // ── Sending ──────────────────────────────────────────────────────────────────
  /** Sends to an already-resolved list, writing one SmsMessage log row per recipient. */
  async sendToRecipients(recipients: string[], message: string, meta: SendMeta) {
    const category = meta.category ?? 'MANUAL';
    let sent = 0;
    let failed = 0;
    for (const mobile of recipients) {
      const result = await this.advanta.sendOne(mobile, message);
      if (result.ok) sent++;
      else failed++;
      await this.app.prisma.smsMessage.create({
        data: {
          recipient: mobile,
          message,
          category,
          status: result.ok ? 'SENT' : 'FAILED',
          providerMessageId: result.providerMessageId ?? null,
          error: result.ok ? null : result.error ?? 'Unknown error',
          groupLabel: meta.groupLabel ?? null,
          incidentId: meta.incidentId ?? null,
          sentById: meta.sentById ?? null,
        },
      });
    }
    return { total: recipients.length, sent, failed };
  }

  async send(spec: RecipientSpec, message: string, meta: SendMeta) {
    const recipients = await this.resolveRecipients(spec);
    if (!recipients.length) return { total: 0, sent: 0, failed: 0 };
    return this.sendToRecipients(recipients, message, meta);
  }

  // ── Auto-notify (called from incident flows; never throws into them) ─────────
  async notifyPartnersForCase(opts: {
    incidentId: string;
    tag: 'GBV' | 'MCI';
    vars: Record<string, string | number | undefined>;
  }) {
    // Dedup: only one auto-notify per incident per tag.
    const existing = await this.app.prisma.smsMessage.findFirst({
      where: { incidentId: opts.incidentId, category: 'AUTO_PARTNER', groupLabel: opts.tag },
    });
    if (existing) return { total: 0, sent: 0, failed: 0, skipped: true };

    const templates = await this.getTemplates();
    const tpl = templates.find((t) => t.key === opts.tag);
    if (!tpl) return { total: 0, sent: 0, failed: 0 };

    const message = this.renderTemplate(tpl.body, opts.vars);
    const recipients = await this.resolveRecipients({ partnerNiche: opts.tag });
    if (!recipients.length) return { total: 0, sent: 0, failed: 0 };

    return this.sendToRecipients(recipients, message, {
      category: 'AUTO_PARTNER',
      groupLabel: opts.tag,
      incidentId: opts.incidentId,
    });
  }

  async notifySurveillance(opts: { incidentId?: string; vars: Record<string, string | number | undefined> }) {
    const templates = await this.getTemplates();
    const tpl = templates.find((t) => t.key === 'SURVEILLANCE');
    if (!tpl) return { total: 0, sent: 0, failed: 0 };

    const message = this.renderTemplate(tpl.body, opts.vars);
    const recipients = await this.resolveRecipients({ contactGroups: ['SURVEILLANCE'] });
    if (!recipients.length) return { total: 0, sent: 0, failed: 0 };

    return this.sendToRecipients(recipients, message, {
      category: 'SURVEILLANCE',
      groupLabel: 'SURVEILLANCE',
      incidentId: opts.incidentId,
    });
  }

  // ── Logs / contacts / balance ────────────────────────────────────────────────
  listLogs(filter: { limit?: number; category?: string; incidentId?: string }) {
    return this.app.prisma.smsMessage.findMany({
      where: {
        ...(filter.category ? { category: filter.category } : {}),
        ...(filter.incidentId ? { incidentId: filter.incidentId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(filter.limit ?? 100, 500),
    });
  }

  listContacts() {
    return this.app.prisma.smsContact.findMany({ orderBy: [{ group: 'asc' }, { name: 'asc' }] });
  }

  createContact(d: { name: string; phone: string; group: string }) {
    return this.app.prisma.smsContact.create({
      data: { name: d.name, phone: normalizeMsisdn(d.phone) ?? d.phone, group: d.group.toUpperCase() },
    });
  }

  updateContact(id: string, d: Partial<{ name: string; phone: string; group: string; isActive: boolean }>) {
    const data: Record<string, unknown> = { ...d };
    if (d.phone) data.phone = normalizeMsisdn(d.phone) ?? d.phone;
    if (d.group) data.group = d.group.toUpperCase();
    return this.app.prisma.smsContact.update({ where: { id }, data });
  }

  deleteContact(id: string) {
    return this.app.prisma.smsContact.delete({ where: { id } });
  }

  getBalance() {
    return this.advanta.getBalance();
  }
}

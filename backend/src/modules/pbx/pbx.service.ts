import crypto from 'crypto';
import { FastifyInstance } from 'fastify';
import { Role } from '../../shared/types/index.js';

/**
 * Yeastar S-Series PBX Integration
 *
 * Auth flow:
 *   POST /api/v1.1.0/user/login?username={user}&password={md5(pass)}
 *   → { status: "Success", token: "...", refreshtime: 1800 }
 *
 * Webhook: PBX pushes CDR and extension status events to POST /pbx/webhook
 *   Configure this in PBX > Settings > General > Application Server
 *
 * Credentials in .env:
 *   YEASTAR_BASE_URL    = http://<pbx-ip>
 *   YEASTAR_USERNAME    = api_user
 *   YEASTAR_PASSWORD    = api_password
 *   YEASTAR_WEBHOOK_SECRET = <shared-secret>
 */

interface YeastarCdr {
  action: 'NewCdr';
  cdrid: string;
  callid: string;
  timestart: string;
  callfrom: string;
  callto: string;
  callduraction: string;
  talkduraction: string;
  srctrunkname?: string;
  desttrunkname?: string;
  didnumber?: string;
  status: string;
  type: string;
  recording?: string;
  sn?: string;
}

interface YeastarExtStatus {
  action: 'ExtensionStatus';
  extensionnum: string;
  extensionstatus: string;
  callfrom?: string;
  callto?: string;
}

export interface ActiveCall {
  callId: string;
  direction: 'INBOUND' | 'OUTBOUND' | 'INTERNAL';
  callFrom: string;
  callTo: string;
  status: 'RINGING' | 'ANSWERED';
  startedAt: string;
}

const HEARTBEAT_INTERVAL_MS = 25 * 60 * 1000;

export class PbxService {
  private token: string | null = null;
  private tokenExpiry = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private activeCalls = new Map<string, ActiveCall>();

  private readonly baseUrl: string;
  private readonly username: string;
  private readonly password: string;

  constructor(private app: FastifyInstance) {
    this.baseUrl = (app.config.YEASTAR_BASE_URL ?? '').replace(/\/$/, '');
    this.username = app.config.YEASTAR_USERNAME ?? '';
    this.password = app.config.YEASTAR_PASSWORD ?? '';
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  private md5(str: string): string {
    return crypto.createHash('md5').update(str).digest('hex');
  }

  private async login(): Promise<string> {
    const url = `${this.baseUrl}/api/v1.1.0/user/login?username=${encodeURIComponent(this.username)}&password=${this.md5(this.password)}`;
    const res = await fetch(url, { method: 'POST' });
    if (!res.ok) throw new Error(`Yeastar login failed: HTTP ${res.status}`);
    const body: any = await res.json();
    if (body.status !== 'Success') throw new Error(`Yeastar login: ${body.status}`);
    this.token = body.token;
    // Expire 60s before refreshtime to avoid using stale tokens
    this.tokenExpiry = Date.now() + ((body.refreshtime ?? 1800) - 60) * 1000;
    this.app.log.info('Yeastar PBX: authenticated');
    return this.token!;
  }

  async getToken(): Promise<string> {
    if (this.token && Date.now() < this.tokenExpiry) return this.token;
    return this.login();
  }

  private async sendHeartbeat(): Promise<void> {
    if (!this.token) return;
    const url = `${this.baseUrl}/api/v1.1.0/heartbeat?token=${this.token}`;
    const res = await fetch(url, { method: 'POST' });
    if (!res.ok) {
      this.app.log.warn('Yeastar PBX: heartbeat failed — will re-auth on next call');
      this.token = null;
      return;
    }
    const body: any = await res.json();
    if (body.status !== 'Success') {
      this.app.log.warn({ body }, 'Yeastar PBX: heartbeat rejected — will re-auth on next call');
      this.token = null;
    }
  }

  // ── Click-to-call ─────────────────────────────────────────────────────────

  async dialOutbound(extId: string, outNumber: string): Promise<void> {
    const token = await this.getToken();
    const url = `${this.baseUrl}/api/v1.1.0/extension/dial_outbound?token=${token}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ extid: extId, outto: outNumber, autoanswer: 1 }),
    });
    if (!res.ok) throw new Error(`Yeastar dial failed: HTTP ${res.status}`);
    const body: any = await res.json();
    if (body.status !== 'Success') throw new Error(`Yeastar dial failed: ${body.status}`);
    this.app.log.info({ extId, outNumber }, 'Yeastar PBX: outbound call initiated');
  }

  // ── CDR (pull from PBX) ───────────────────────────────────────────────────

  async queryCdrFromPbx(startTime: string, endTime: string): Promise<any[]> {
    const token = await this.getToken();
    const url = `${this.baseUrl}/api/v1.1.0/cdr/search?token=${token}&format=json`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ starttime: startTime, endtime: endTime }),
    });
    if (!res.ok) throw new Error(`Yeastar CDR query failed: HTTP ${res.status}`);
    const body: any = await res.json();
    return body?.data ?? body?.cdrs ?? [];
  }

  // ── Webhook event handlers ────────────────────────────────────────────────

  async handleCdrPush(cdr: YeastarCdr): Promise<void> {
    const direction = cdr.type === 'Inbound' ? 'INBOUND' : cdr.type === 'Outbound' ? 'OUTBOUND' : 'INTERNAL';
    const rawStatus = (cdr.status ?? '').toUpperCase().replace(' ', '_');
    const status = (['ANSWERED', 'NO_ANSWER', 'BUSY', 'FAILED'] as const).includes(rawStatus as any)
      ? (rawStatus as 'ANSWERED' | 'NO_ANSWER' | 'BUSY' | 'FAILED')
      : 'FAILED';

    // timestart format from PBX: "YYYY-MM-DD HH:mm:ss"
    const startedAt = new Date(cdr.timestart.replace(' ', 'T') + 'Z');
    const duration = parseInt(cdr.callduraction ?? '0', 10);
    const talkDuration = parseInt(cdr.talkduraction ?? '0', 10);
    const endedAt = new Date(startedAt.getTime() + duration * 1000);

    const saved = await this.app.prisma.callLog.upsert({
      where: { callId: cdr.callid },
      create: {
        callId: cdr.callid,
        direction,
        callFrom: cdr.callfrom,
        callTo: cdr.callto,
        startedAt,
        endedAt,
        duration,
        talkDuration,
        status,
        recording: cdr.recording || null,
        trunkName: cdr.srctrunkname || null,
        didNumber: cdr.didnumber || null,
      },
      update: { status, endedAt, duration, talkDuration, recording: cdr.recording || null },
    });

    this.activeCalls.delete(cdr.callid);

    this.app.io
      .to(`role:${Role.DISPATCHER}`)
      .to(`role:${Role.ADMIN}`)
      .to(`role:${Role.SUPER_ADMIN}`)
      .emit('pbx:call:ended', saved);

    this.app.log.info({ callId: cdr.callid, status, direction }, 'PBX: CDR saved');
  }

  handleExtensionStatus(event: YeastarExtStatus): void {
    const status = (event.extensionstatus ?? '').toLowerCase();

    if (status === 'ringing' && event.callfrom) {
      const callId = `ext:${event.extensionnum}:${Date.now()}`;
      const call: ActiveCall = {
        callId,
        direction: 'INBOUND',
        callFrom: event.callfrom,
        callTo: event.extensionnum,
        status: 'RINGING',
        startedAt: new Date().toISOString(),
      };
      this.activeCalls.set(callId, call);
      this.app.io
        .to(`role:${Role.DISPATCHER}`)
        .to(`role:${Role.ADMIN}`)
        .to(`role:${Role.SUPER_ADMIN}`)
        .emit('pbx:call:new', call);
    } else if (status === 'busy') {
      for (const [id, call] of this.activeCalls) {
        if (call.callTo === event.extensionnum || call.callFrom === event.extensionnum) {
          const answered: ActiveCall = { ...call, status: 'ANSWERED' };
          this.activeCalls.set(id, answered);
          this.app.io
            .to(`role:${Role.DISPATCHER}`)
            .to(`role:${Role.ADMIN}`)
            .to(`role:${Role.SUPER_ADMIN}`)
            .emit('pbx:call:answered', answered);
          break;
        }
      }
    } else if (status === 'idle') {
      for (const [id, call] of this.activeCalls) {
        if (call.callTo === event.extensionnum || call.callFrom === event.extensionnum) {
          this.activeCalls.delete(id);
          break;
        }
      }
    }
  }

  getActiveCalls(): ActiveCall[] {
    return Array.from(this.activeCalls.values());
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  start(): void {
    if (!this.baseUrl || !this.username || !this.password) {
      this.app.log.warn(
        'Yeastar PBX: credentials not configured — PBX integration disabled. ' +
        'Set YEASTAR_BASE_URL, YEASTAR_USERNAME, YEASTAR_PASSWORD in .env'
      );
      return;
    }

    this.login().catch((err) =>
      this.app.log.warn({ err }, 'Yeastar PBX: initial login failed — will retry on first request')
    );

    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat().catch((err) =>
        this.app.log.warn({ err }, 'Yeastar PBX: heartbeat error')
      );
    }, HEARTBEAT_INTERVAL_MS);

    this.app.log.info('Yeastar PBX: service started');
  }

  stop(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  healthStatus() {
    return {
      isConnected: !!this.token && Date.now() < this.tokenExpiry,
      activeCalls: this.activeCalls.size,
      tokenExpiresAt: this.token ? new Date(this.tokenExpiry).toISOString() : null,
    };
  }
}

import { FastifyInstance } from 'fastify';
import { randomInt } from 'node:crypto';
import { hashPassword, comparePassword } from '../../shared/utils/hash.js';
import { Role } from '../../shared/types/index.js';
import { UnauthorizedError, ConflictError, BadRequestError } from '../../shared/errors/AppError.js';
import { SmsService, normalizeMsisdn } from '../sms/sms.service.js';

// Roles that log in to the mobile app with a phone number and an OTP instead of
// email and password. Every other role works on the web dashboard and keeps the
// email/password flow in login() below.
const OTP_LOGIN_ROLES: Role[] = [Role.DRIVER, Role.EMT];

const OTP_TTL_MS = 5 * 60 * 1000; // code is valid for 5 minutes
const OTP_REQUEST_COOLDOWN_MS = 60 * 1000; // at most one send per minute per phone
const OTP_MAX_REQUESTS_PER_HOUR = 5; // caps SMS spend if a number is abused
const OTP_MAX_VERIFY_ATTEMPTS = 5; // wrong-code attempts before the code is dead

export class AuthService {
  constructor(private app: FastifyInstance) {}

  /**
   * Registers a new user.
   */
  async register(data: { email: string; passwordRaw: string; name: string; role: Role; agencyId: string; phone?: string }) {
    // 1. Check if user exists
    const existingUser = await this.app.prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      throw new ConflictError('User with this email already exists');
    }

    // 2. Validate agency
    const agency = await this.app.prisma.agency.findUnique({
      where: { id: data.agencyId },
    });

    if (!agency) {
      throw new BadRequestError('Invalid agency ID');
    }

    // 3. Hash password
    const passwordHash = await hashPassword(data.passwordRaw);

    // 4. Create user
    const user = await this.app.prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        name: data.name,
        role: data.role,
        agencyId: data.agencyId,
        phone: data.phone,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        agencyId: true,
        createdAt: true,
      },
    });

    return user;
  }

  /**
   * Logs in a user and returns a JWT token.
   */
  async login(data: { email: string; passwordRaw: string }) {
    // 1. Find user
    const user = await this.app.prisma.user.findUnique({
      where: { email: data.email },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // 2. Compare password
    const isPasswordValid = await comparePassword(data.passwordRaw, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // 3. Generate token
    const token = this.app.jwt.sign({
      userId: user.id,
      role: user.role,
      agencyId: user.agencyId,
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        agencyId: user.agencyId,
      },
    };
  }

  /**
   * Sends a one-time login code by SMS to a driver or EMT's phone.
   * Only accounts with an OTP-eligible role (DRIVER, EMT) can request a code —
   * everyone else uses login() from the web dashboard.
   */
  async requestOtp(phoneRaw: string) {
    const phone = normalizeMsisdn(phoneRaw);
    if (!phone) {
      throw new BadRequestError('Enter a valid phone number');
    }

    const matches = await this.app.prisma.user.findMany({
      where: { phone, role: { in: OTP_LOGIN_ROLES }, isActive: true },
      select: { id: true },
    });
    if (matches.length === 0) {
      throw new UnauthorizedError('No active driver or EMT account found for this number');
    }
    if (matches.length > 1) {
      // Two accounts sharing one phone number would make the code ambiguous —
      // this is a data-hygiene issue for an admin to fix, not a normal login error.
      throw new ConflictError('Multiple accounts share this phone number — contact an admin');
    }

    const lastCode = await this.app.prisma.otpCode.findFirst({
      where: { phone },
      orderBy: { createdAt: 'desc' },
    });
    if (lastCode && Date.now() - lastCode.createdAt.getTime() < OTP_REQUEST_COOLDOWN_MS) {
      throw new BadRequestError('Please wait a minute before requesting another code');
    }

    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const requestsThisHour = await this.app.prisma.otpCode.count({
      where: { phone, createdAt: { gte: hourAgo } },
    });
    if (requestsThisHour >= OTP_MAX_REQUESTS_PER_HOUR) {
      throw new BadRequestError('Too many code requests for this number, try again later');
    }

    const code = String(randomInt(100000, 1000000)); // always 6 digits
    const codeHash = await hashPassword(code);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    await this.app.prisma.otpCode.create({ data: { phone, codeHash, expiresAt } });

    const message = `Your EOC login code is ${code}. It expires in 5 minutes. Do not share this code.`;
    const smsService = new SmsService(this.app);
    await smsService.sendToRecipients([phone], message, { category: 'OTP' });

    return {
      message: 'Code sent',
      expiresInSeconds: OTP_TTL_MS / 1000,
      // Dev convenience only — never present outside development, so a code can
      // never be read back from the API on a real device or in production.
      ...(this.app.config.NODE_ENV !== 'production' ? { devCode: code } : {}),
    };
  }

  /**
   * Verifies a one-time code and logs the driver/EMT in, returning the same
   * { token, user } shape as login() so the mobile app can treat both the same way.
   */
  async verifyOtp(phoneRaw: string, code: string) {
    const phone = normalizeMsisdn(phoneRaw);
    if (!phone) {
      throw new BadRequestError('Enter a valid phone number');
    }

    const otp = await this.app.prisma.otpCode.findFirst({
      where: { phone, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp) {
      throw new BadRequestError('Code expired or not found, request a new one');
    }
    if (otp.attempts >= OTP_MAX_VERIFY_ATTEMPTS) {
      throw new BadRequestError('Too many incorrect attempts, request a new code');
    }

    const isValid = await comparePassword(code, otp.codeHash);
    if (!isValid) {
      await this.app.prisma.otpCode.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedError('Incorrect code');
    }

    const user = await this.app.prisma.user.findFirst({
      where: { phone, role: { in: OTP_LOGIN_ROLES }, isActive: true },
    });
    if (!user) {
      throw new UnauthorizedError('No active driver or EMT account found for this number');
    }

    await this.app.prisma.otpCode.update({
      where: { id: otp.id },
      data: { consumedAt: new Date() },
    });

    const token = this.app.jwt.sign({
      userId: user.id,
      role: user.role,
      agencyId: user.agencyId,
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        agencyId: user.agencyId,
      },
    };
  }
}

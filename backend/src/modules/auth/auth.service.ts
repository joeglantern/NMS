import { FastifyInstance } from 'fastify';
import { hashPassword, comparePassword } from '../../shared/utils/hash.js';
import { Role } from '../../shared/types/index.js';
import { UnauthorizedError, ConflictError, BadRequestError } from '../../shared/errors/AppError.js';

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
}

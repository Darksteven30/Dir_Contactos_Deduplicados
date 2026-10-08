import { UnauthorizedError } from '../../shared/errors/AppError';
import type { AccessTokenService } from '../../shared/security/accessToken';
import { generateFamilyId, generateOpaqueToken, hashToken } from '../../shared/security/opaqueToken';
import type { PasswordHasher } from '../../shared/security/passwordHasher';
import type { User } from '../users/user.entity';
import type { UserRepository } from '../users/user.repository';
import type { UserService } from '../users/user.service';
import type { LoginDto, RegisterDto } from './auth.schemas';
import type { RefreshTokenRepository } from './refreshToken.repository';

export interface AuthSession {
  user: User;
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export interface AuthServiceOptions {
  refreshTokenTtlMs: number;
  now?: () => Date;
}

const INVALID_CREDENTIALS = 'Email o contraseña incorrectos';
const INVALID_SESSION = 'Sesión inválida o expirada';

/**
 * Flujo de doble token:
 * - Access token (JWT corto) que el cliente guarda solo en memoria.
 * - Refresh token opaco y rotativo en cookie HttpOnly. Cada uso lo reemplaza por uno nuevo;
 *   si se presenta uno ya usado, se asume robo y se revocan todas las sesiones del usuario.
 */
export class AuthService {
  private readonly refreshTokenTtlMs: number;
  private readonly now: () => Date;
  private dummyHash: Promise<string> | undefined;

  constructor(
    private readonly userService: UserService,
    private readonly users: UserRepository,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly hasher: PasswordHasher,
    private readonly accessTokens: AccessTokenService,
    options: AuthServiceOptions,
  ) {
    this.refreshTokenTtlMs = options.refreshTokenTtlMs;
    this.now = options.now ?? (() => new Date());
  }

  async register(dto: RegisterDto): Promise<AuthSession> {
    const user = await this.userService.create({ ...dto, role: 'user' });
    return this.startSession(user);
  }

  async login(dto: LoginDto): Promise<AuthSession> {
    const found = await this.users.findByEmail(dto.email);

    // Si el email no existe se compara igual contra un hash ficticio, para que el tiempo
    // de respuesta no revele qué emails están registrados.
    const hash = found?.passwordHash ?? (await this.getDummyHash());
    const passwordMatches = await this.hasher.compare(dto.password, hash);

    if (!found || !passwordMatches) throw new UnauthorizedError(INVALID_CREDENTIALS);

    const { passwordHash: _omit, ...user } = found;
    return this.startSession(user);
  }

  async refresh(presentedToken: string | undefined): Promise<AuthSession> {
    if (!presentedToken) throw new UnauthorizedError(INVALID_SESSION);

    const now = this.now();
    const next = this.newRefreshToken(now);
    const result = await this.refreshTokens.rotate(hashToken(presentedToken), next.record, now);

    if (result.status === 'reused') {
      await this.refreshTokens.revokeAllForUser(result.userId, now, 'reuse_detected');
      throw new UnauthorizedError('Se detectó reutilización del token. Se cerraron todas las sesiones');
    }
    if (result.status === 'invalid') throw new UnauthorizedError(INVALID_SESSION);

    // Se relee el usuario: su rol pudo cambiar o pudo ser eliminado desde el último login.
    const user = await this.users.findById(result.userId);
    if (!user) throw new UnauthorizedError(INVALID_SESSION);

    return this.buildSession(user, next.token, next.record.expiresAt);
  }

  async logout(presentedToken: string | undefined): Promise<void> {
    if (!presentedToken) return;
    await this.refreshTokens.revokeFamilyOf(hashToken(presentedToken), this.now());
  }

  async logoutAll(userId: number): Promise<void> {
    await this.refreshTokens.revokeAllForUser(userId, this.now(), 'logout_all');
  }

  me(userId: number): Promise<User> {
    return this.userService.getById(userId);
  }

  private async startSession(user: User): Promise<AuthSession> {
    const now = this.now();
    const next = this.newRefreshToken(now);
    await this.refreshTokens.create({ userId: user.id, familyId: generateFamilyId(), ...next.record });
    return this.buildSession(user, next.token, next.record.expiresAt);
  }

  private buildSession(user: User, refreshToken: string, refreshTokenExpiresAt: Date): AuthSession {
    return {
      user,
      accessToken: this.accessTokens.sign({ userId: user.id, role: user.role }),
      accessTokenExpiresIn: this.accessTokens.ttlSeconds,
      refreshToken,
      refreshTokenExpiresAt,
    };
  }

  private newRefreshToken(now: Date) {
    const token = generateOpaqueToken();
    return {
      token,
      record: { tokenHash: hashToken(token), expiresAt: new Date(now.getTime() + this.refreshTokenTtlMs) },
    };
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= this.hasher.hash('contraseña-ficticia-para-igualar-tiempos');
    return this.dummyHash;
  }
}

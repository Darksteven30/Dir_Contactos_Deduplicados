import { beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from '../../src/modules/auth/auth.service';
import { UserService } from '../../src/modules/users/user.service';
import { ConflictError, UnauthorizedError } from '../../src/shared/errors/AppError';
import { JwtAccessTokenService } from '../../src/shared/security/accessToken';
import {
  fakeHasher,
  InMemoryRefreshTokenRepository,
  InMemoryUserRepository,
} from '../support/inMemoryRepositories';

const SECRET = 'secreto-de-pruebas-con-al-menos-32-caracteres';
const DAY_MS = 24 * 60 * 60 * 1000;
const ANA = { name: 'Ana', email: 'ana@test.com', password: 'secreto123' };

describe('AuthService', () => {
  let users: InMemoryUserRepository;
  let refreshTokens: InMemoryRefreshTokenRepository;
  let accessTokens: JwtAccessTokenService;
  let service: AuthService;
  let now: Date;

  beforeEach(() => {
    users = new InMemoryUserRepository();
    refreshTokens = new InMemoryRefreshTokenRepository();
    accessTokens = new JwtAccessTokenService(SECRET, 900);
    now = new Date('2026-01-01T00:00:00Z');
    service = new AuthService(
      new UserService(users, fakeHasher),
      users,
      refreshTokens,
      fakeHasher,
      accessTokens,
      { refreshTokenTtlMs: 7 * DAY_MS, now: () => now },
    );
  });

  describe('register', () => {
    it('crea un usuario con rol "user" e inicia sesión', async () => {
      const session = await service.register(ANA);

      expect(session.user.role).toBe('user');
      expect(accessTokens.verify(session.accessToken)).toEqual({ userId: session.user.id, role: 'user' });
      expect(refreshTokens.activeFor(session.user.id)).toHaveLength(1);
    });

    it('rechaza un email ya registrado', async () => {
      await service.register(ANA);
      await expect(service.register(ANA)).rejects.toBeInstanceOf(ConflictError);
    });

    it('no guarda el refresh token en claro', async () => {
      const session = await service.register(ANA);
      const stored = refreshTokens.tokens.map((t) => t.tokenHash);
      expect(stored).not.toContain(session.refreshToken);
    });
  });

  describe('login', () => {
    beforeEach(async () => {
      await service.register(ANA);
    });

    it('inicia sesión con credenciales correctas', async () => {
      const session = await service.login({ email: ANA.email, password: ANA.password });
      expect(session.user.email).toBe(ANA.email);
      expect(session.user).not.toHaveProperty('passwordHash');
    });

    it('rechaza una contraseña incorrecta', async () => {
      await expect(service.login({ email: ANA.email, password: 'otra-clave' })).rejects.toBeInstanceOf(
        UnauthorizedError,
      );
    });

    it('rechaza un email inexistente con el mismo mensaje', async () => {
      const wrongPassword = service.login({ email: ANA.email, password: 'otra-clave' });
      const unknownEmail = service.login({ email: 'nadie@test.com', password: 'x' });

      const [a, b] = await Promise.allSettled([wrongPassword, unknownEmail]);
      expect(a.status === 'rejected' && b.status === 'rejected').toBe(true);
      if (a.status === 'rejected' && b.status === 'rejected') {
        expect((a.reason as Error).message).toBe((b.reason as Error).message);
      }
    });

    it('cada login abre una sesión independiente', async () => {
      const first = await service.login({ email: ANA.email, password: ANA.password });
      expect(refreshTokens.activeFor(first.user.id)).toHaveLength(2);
    });
  });

  describe('refresh', () => {
    it('rota el refresh token: entrega uno nuevo y revoca el anterior', async () => {
      const { refreshToken } = await service.register(ANA);

      const renewed = await service.refresh(refreshToken);

      expect(renewed.refreshToken).not.toBe(refreshToken);
      expect(accessTokens.verify(renewed.accessToken)).not.toBeNull();
      expect(refreshTokens.activeFor(renewed.user.id)).toHaveLength(1);
    });

    it('detecta reutilización y revoca todas las sesiones del usuario', async () => {
      const original = await service.register(ANA);
      const otherDevice = await service.login({ email: ANA.email, password: ANA.password });
      await service.refresh(original.refreshToken);

      // Un atacante presenta el token ya rotado.
      await expect(service.refresh(original.refreshToken)).rejects.toBeInstanceOf(UnauthorizedError);

      expect(refreshTokens.activeFor(original.user.id)).toHaveLength(0);
      await expect(service.refresh(otherDevice.refreshToken)).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it('rechaza un refresh token expirado', async () => {
      const { refreshToken } = await service.register(ANA);
      now = new Date(now.getTime() + 8 * DAY_MS);

      await expect(service.refresh(refreshToken)).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it('rechaza un token desconocido o ausente', async () => {
      await expect(service.refresh('token-inventado')).rejects.toBeInstanceOf(UnauthorizedError);
      await expect(service.refresh(undefined)).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it('refleja en el nuevo access token el rol actual del usuario', async () => {
      const { refreshToken, user } = await service.register(ANA);
      const stored = await users.findByEmail(ANA.email);
      if (stored) stored.role = 'admin';

      const renewed = await service.refresh(refreshToken);

      expect(accessTokens.verify(renewed.accessToken)).toEqual({ userId: user.id, role: 'admin' });
    });
  });

  describe('logout', () => {
    it('presentar un token cerrado con logout no se trata como robo', async () => {
      const laptop = await service.register(ANA);
      const phone = await service.login({ email: ANA.email, password: ANA.password });
      await service.logout(laptop.refreshToken);

      await expect(service.refresh(laptop.refreshToken)).rejects.toBeInstanceOf(UnauthorizedError);

      expect(refreshTokens.activeFor(phone.user.id)).toHaveLength(1);
    });

    it('logout revoca solo la sesión actual', async () => {
      const laptop = await service.register(ANA);
      const phone = await service.login({ email: ANA.email, password: ANA.password });

      await service.logout(laptop.refreshToken);

      await expect(service.refresh(laptop.refreshToken)).rejects.toBeInstanceOf(UnauthorizedError);
      await expect(service.refresh(phone.refreshToken)).resolves.toBeDefined();
    });

    it('logoutAll revoca todas las sesiones', async () => {
      const laptop = await service.register(ANA);
      const phone = await service.login({ email: ANA.email, password: ANA.password });

      await service.logoutAll(laptop.user.id);

      await expect(service.refresh(laptop.refreshToken)).rejects.toBeInstanceOf(UnauthorizedError);
      await expect(service.refresh(phone.refreshToken)).rejects.toBeInstanceOf(UnauthorizedError);
    });
  });
});

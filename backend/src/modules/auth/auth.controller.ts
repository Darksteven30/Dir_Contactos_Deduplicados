import type { CookieOptions, Request, Response } from 'express';
import { UnauthorizedError } from '../../shared/errors/AppError';
import { ok } from '../../shared/http/response';
import { loginSchema, registerSchema } from './auth.schemas';
import type { AuthService, AuthSession } from './auth.service';

export const REFRESH_COOKIE_NAME = 'refresh_token';
// La cookie solo viaja a las rutas de auth, no a todo /api.
const REFRESH_COOKIE_PATH = '/api/auth';

export interface AuthControllerOptions {
  cookieSecure: boolean;
}

export class AuthController {
  private readonly baseCookie: CookieOptions;

  constructor(
    private readonly service: AuthService,
    { cookieSecure }: AuthControllerOptions,
  ) {
    this.baseCookie = { httpOnly: true, secure: cookieSecure, sameSite: 'strict', path: REFRESH_COOKIE_PATH };
  }

  register = async (req: Request, res: Response): Promise<void> => {
    const session = await this.service.register(registerSchema.parse(req.body));
    this.sendSession(res.status(201), session);
  };

  login = async (req: Request, res: Response): Promise<void> => {
    const session = await this.service.login(loginSchema.parse(req.body));
    this.sendSession(res, session);
  };

  refresh = async (req: Request, res: Response): Promise<void> => {
    try {
      const session = await this.service.refresh(this.readRefreshCookie(req));
      this.sendSession(res, session);
    } catch (err) {
      // Si la sesión no es válida se borra la cookie para que el cliente no la reintente.
      if (err instanceof UnauthorizedError) res.clearCookie(REFRESH_COOKIE_NAME, this.baseCookie);
      throw err;
    }
  };

  logout = async (req: Request, res: Response): Promise<void> => {
    await this.service.logout(this.readRefreshCookie(req));
    res.clearCookie(REFRESH_COOKIE_NAME, this.baseCookie).status(204).send();
  };

  logoutAll = async (req: Request, res: Response): Promise<void> => {
    if (!req.auth) throw new UnauthorizedError();
    await this.service.logoutAll(req.auth.userId);
    res.clearCookie(REFRESH_COOKIE_NAME, this.baseCookie).status(204).send();
  };

  me = async (req: Request, res: Response): Promise<void> => {
    if (!req.auth) throw new UnauthorizedError();
    res.json(ok(await this.service.me(req.auth.userId)));
  };

  private readRefreshCookie(req: Request): string | undefined {
    const value: unknown = req.cookies?.[REFRESH_COOKIE_NAME];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  // El refresh token va solo en la cookie; el body lleva el access token para guardarlo en memoria.
  private sendSession(res: Response, session: AuthSession): void {
    res.cookie(REFRESH_COOKIE_NAME, session.refreshToken, {
      ...this.baseCookie,
      expires: session.refreshTokenExpiresAt,
    });
    res.json(
      ok({
        accessToken: session.accessToken,
        tokenType: 'Bearer',
        expiresIn: session.accessTokenExpiresIn,
        user: session.user,
      }),
    );
  }
}

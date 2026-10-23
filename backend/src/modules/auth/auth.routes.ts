import { Router, type RequestHandler } from 'express';
import { createRateLimiter } from '../../shared/middlewares/rateLimit';
import type { AuthController } from './auth.controller';

const FIFTEEN_MINUTES = 15 * 60 * 1000;

export interface AuthRouterOptions {
  /** Intentos de login/registro permitidos por IP cada 15 minutos (protección contra fuerza bruta). */
  credentialsLimit?: number;
  /** Encabezado del CDN con la IP real del usuario (p. ej. `cf-connecting-ip`) para contar los intentos. */
  clientIpHeader?: string;
}

const DEFAULT_CREDENTIALS_LIMIT = 10;

/**
 * @swagger
 * components:
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *   schemas:
 *     RegisterInput:
 *       type: object
 *       required: [name, email, password]
 *       properties:
 *         name:
 *           type: string
 *           example: Ana Gómez
 *         email:
 *           type: string
 *           example: ana@example.com
 *         password:
 *           type: string
 *           minLength: 8
 *           example: secreto123
 *     LoginInput:
 *       type: object
 *       required: [email, password]
 *       properties:
 *         email:
 *           type: string
 *           example: ana@example.com
 *         password:
 *           type: string
 *           example: secreto123
 *     AuthResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *         data:
 *           type: object
 *           properties:
 *             accessToken:
 *               type: string
 *             tokenType:
 *               type: string
 *               example: Bearer
 *             expiresIn:
 *               type: integer
 *               description: Segundos de vida del access token
 *               example: 900
 *             user:
 *               $ref: '#/components/schemas/User'
 */
export function createAuthRouter(
  controller: AuthController,
  authenticate: RequestHandler,
  { credentialsLimit = DEFAULT_CREDENTIALS_LIMIT, clientIpHeader }: AuthRouterOptions = {},
): Router {
  const router = Router();
  const byClientIp = clientIpHeader ? { clientIpHeader } : {};

  const credentialsLimiter = createRateLimiter({
    ...byClientIp,
    windowMs: FIFTEEN_MINUTES,
    limit: credentialsLimit,
    message: 'Demasiados intentos. Espera 15 minutos e intenta de nuevo',
  });
  const refreshLimiter = createRateLimiter({
    ...byClientIp,
    windowMs: FIFTEEN_MINUTES,
    limit: 60,
    message: 'Demasiadas renovaciones de sesión. Intenta más tarde',
  });

  /**
   * @swagger
   * /api/auth/register:
   *   post:
   *     summary: Registrar una cuenta e iniciar sesión
   *     description: Devuelve el access token y deja el refresh token en una cookie HttpOnly.
   *     tags: [Auth]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/RegisterInput'
   *     responses:
   *       201:
   *         description: Cuenta creada
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/AuthResponse'
   *       400:
   *         description: Datos inválidos
   *       409:
   *         description: Email ya registrado
   *       429:
   *         description: Demasiados intentos
   */
  router.post('/register', credentialsLimiter, controller.register);

  /**
   * @swagger
   * /api/auth/login:
   *   post:
   *     summary: Iniciar sesión
   *     description: Devuelve el access token y deja el refresh token en una cookie HttpOnly.
   *     tags: [Auth]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/LoginInput'
   *     responses:
   *       200:
   *         description: Sesión iniciada
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/AuthResponse'
   *       401:
   *         description: Credenciales incorrectas
   *       429:
   *         description: Demasiados intentos
   */
  router.post('/login', credentialsLimiter, controller.login);

  /**
   * @swagger
   * /api/auth/refresh:
   *   post:
   *     summary: Renovar el access token
   *     description: >
   *       Usa la cookie `refresh_token`, la rota (la anterior queda revocada) y devuelve un nuevo
   *       access token. Si se presenta un refresh token ya usado se revocan todas las sesiones del usuario.
   *     tags: [Auth]
   *     responses:
   *       200:
   *         description: Sesión renovada
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/AuthResponse'
   *       401:
   *         description: Refresh token ausente, inválido, expirado o reutilizado
   */
  router.post('/refresh', refreshLimiter, controller.refresh);

  /**
   * @swagger
   * /api/auth/logout:
   *   post:
   *     summary: Cerrar la sesión actual
   *     description: Revoca la sesión de la cookie `refresh_token` y la borra.
   *     tags: [Auth]
   *     responses:
   *       204:
   *         description: Sesión cerrada
   */
  router.post('/logout', controller.logout);

  /**
   * @swagger
   * /api/auth/logout-all:
   *   post:
   *     summary: Cerrar todas las sesiones del usuario
   *     tags: [Auth]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       204:
   *         description: Todas las sesiones cerradas
   *       401:
   *         description: No autenticado
   */
  router.post('/logout-all', authenticate, controller.logoutAll);

  /**
   * @swagger
   * /api/auth/me:
   *   get:
   *     summary: Obtener el usuario autenticado
   *     tags: [Auth]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Usuario autenticado
   *       401:
   *         description: No autenticado
   */
  router.get('/me', authenticate, controller.me);

  return router;
}

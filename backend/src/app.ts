import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Pool } from 'pg';
import swaggerUi from 'swagger-ui-express';
import { createSwaggerSpec } from './config/swagger';
import { AuthController } from './modules/auth/auth.controller';
import { createAuthRouter } from './modules/auth/auth.routes';
import { ContactController } from './modules/contacts/contact.controller';
import { PgContactRepository } from './modules/contacts/contact.repository';
import { createContactRouter } from './modules/contacts/contact.routes';
import { ContactService } from './modules/contacts/contact.service';
import { DeduplicationController } from './modules/deduplication/deduplication.controller';
import { PgDeduplicationRepository } from './modules/deduplication/deduplication.repository';
import { createDeduplicationRouter } from './modules/deduplication/deduplication.routes';
import { DeduplicationService } from './modules/deduplication/deduplication.service';
import { AuthService } from './modules/auth/auth.service';
import { PgRefreshTokenRepository } from './modules/auth/refreshToken.repository';
import { UserController } from './modules/users/user.controller';
import { PgUserRepository } from './modules/users/user.repository';
import { createUserRouter } from './modules/users/user.routes';
import { UserService } from './modules/users/user.service';
import { createHealthRouter } from './shared/http/health';
import type { Logger } from './shared/logging/logger';
import { createAuthenticate } from './shared/middlewares/authenticate';
import { requireOwnership } from './shared/middlewares/authorize';
import { correlationId } from './shared/middlewares/correlationId';
import { createErrorHandler, notFoundHandler } from './shared/middlewares/errorHandler';
import { createRequestLogger } from './shared/middlewares/requestLogger';
import { JwtAccessTokenService } from './shared/security/accessToken';
import { BcryptPasswordHasher } from './shared/security/passwordHasher';

export interface AppConfig {
  port: number;
  jwtAccessSecret: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlDays: number;
  cookieSecure: boolean;
  /** Valor de `trust proxy` de Express: cuántos proxies hay delante (0 = ninguno). */
  trustProxy: number;
}

export interface AppDependencies {
  pool: Pool;
  config: AppConfig;
  logger: Logger;
}

export interface Application {
  app: Express;
  /** Expuesto para que el servidor programe las tareas de mantenimiento en la cola. */
  authService: AuthService;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Composition root: aquí (y solo aquí) se instancian las implementaciones concretas
 * y se inyectan en cada capa (repositorio -> servicio -> controlador -> rutas).
 */
export function createApp({ pool, config, logger }: AppDependencies): Application {
  const app = express();
  // Detrás de un proxy (Render, Railway...) la IP real llega en X-Forwarded-For; sin esto el
  // rate limit vería a todos los usuarios como una sola IP.
  app.set('trust proxy', config.trustProxy);

  // El correlation id va primero: así todo lo que se registre después (incluidos errores) lo lleva.
  app.use(correlationId);
  app.use(createRequestLogger(logger));
  // Headers de seguridad (CSP, nosniff, frameguard, HSTS...). Se quita `upgrade-insecure-requests`
  // porque obligaría a pedir por HTTPS los recursos de Swagger cuando se sirve por HTTP en desarrollo;
  // en producción el HTTPS lo pone la plataforma.
  app.use(helmet({ contentSecurityPolicy: { directives: { upgradeInsecureRequests: null } } }));
  app.use(express.json());
  app.use(cookieParser());

  // Infraestructura
  const passwordHasher = new BcryptPasswordHasher();
  const accessTokens = new JwtAccessTokenService(config.jwtAccessSecret, config.accessTokenTtlSeconds);
  const authenticate = createAuthenticate(accessTokens);
  const userRepository = new PgUserRepository(pool);

  // Usuarios
  const userService = new UserService(userRepository, passwordHasher);
  const userController = new UserController(userService);

  // Autenticación
  const authService = new AuthService(
    userService,
    userRepository,
    new PgRefreshTokenRepository(pool),
    passwordHasher,
    accessTokens,
    { refreshTokenTtlMs: config.refreshTokenTtlDays * DAY_MS },
  );
  const authController = new AuthController(authService, { cookieSecure: config.cookieSecure });

  // Contactos
  const contactService = new ContactService(new PgContactRepository(pool));
  const contactController = new ContactController(contactService);
  const requireContactOwner = requireOwnership((id) => contactService.findOwnerId(id));

  // Deduplicación
  const deduplicationController = new DeduplicationController(
    new DeduplicationService(new PgDeduplicationRepository(pool)),
  );

  app.get('/', (_req, res) => {
    res.json({ message: 'API corriendo', docs: '/api-docs' });
  });
  const checkDatabase = async (): Promise<void> => {
    await pool.query('SELECT 1');
  };
  app.use('/health', createHealthRouter(checkDatabase, logger));
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(createSwaggerSpec(config.port)));
  app.use('/api/auth', createAuthRouter(authController, authenticate));
  app.use('/api/users', createUserRouter(userController, authenticate));
  // Debe ir antes que /api/contacts: si no, "duplicates" se tomaría como el :id de un contacto.
  app.use('/api/contacts/duplicates', createDeduplicationRouter(deduplicationController, authenticate));
  app.use('/api/contacts', createContactRouter(contactController, authenticate, requireContactOwner));

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));

  return { app, authService };
}

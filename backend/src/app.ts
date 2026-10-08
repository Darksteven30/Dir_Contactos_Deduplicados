import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import type { Pool } from 'pg';
import swaggerUi from 'swagger-ui-express';
import { createSwaggerSpec } from './config/swagger';
import { AuthController } from './modules/auth/auth.controller';
import { createAuthRouter } from './modules/auth/auth.routes';
import { AuthService } from './modules/auth/auth.service';
import { PgRefreshTokenRepository } from './modules/auth/refreshToken.repository';
import { UserController } from './modules/users/user.controller';
import { PgUserRepository } from './modules/users/user.repository';
import { createUserRouter } from './modules/users/user.routes';
import { UserService } from './modules/users/user.service';
import { createAuthenticate } from './shared/middlewares/authenticate';
import { errorHandler, notFoundHandler } from './shared/middlewares/errorHandler';
import { JwtAccessTokenService } from './shared/security/accessToken';
import { BcryptPasswordHasher } from './shared/security/passwordHasher';

export interface AppConfig {
  port: number;
  jwtAccessSecret: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlDays: number;
  cookieSecure: boolean;
}

export interface AppDependencies {
  pool: Pool;
  config: AppConfig;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Composition root: aquí (y solo aquí) se instancian las implementaciones concretas
 * y se inyectan en cada capa (repositorio -> servicio -> controlador -> rutas).
 */
export function createApp({ pool, config }: AppDependencies): Express {
  const app = express();
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

  app.get('/', (_req, res) => {
    res.json({ message: 'API corriendo', docs: '/api-docs' });
  });
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(createSwaggerSpec(config.port)));
  app.use('/api/auth', createAuthRouter(authController, authenticate));
  app.use('/api/users', createUserRouter(userController, authenticate));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

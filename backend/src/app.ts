import express, { type Express } from 'express';
import type { Pool } from 'pg';
import swaggerUi from 'swagger-ui-express';
import { createSwaggerSpec } from './config/swagger';
import { UserController } from './modules/users/user.controller';
import { PgUserRepository } from './modules/users/user.repository';
import { createUserRouter } from './modules/users/user.routes';
import { UserService } from './modules/users/user.service';
import { errorHandler, notFoundHandler } from './shared/middlewares/errorHandler';
import { BcryptPasswordHasher } from './shared/security/passwordHasher';

export interface AppDependencies {
  pool: Pool;
  port: number;
}

/**
 * Composition root: aquí (y solo aquí) se instancian las implementaciones concretas
 * y se inyectan en cada capa (repositorio -> servicio -> controlador -> rutas).
 */
export function createApp({ pool, port }: AppDependencies): Express {
  const app = express();
  app.use(express.json());

  const passwordHasher = new BcryptPasswordHasher();
  const userService = new UserService(new PgUserRepository(pool), passwordHasher);
  const userController = new UserController(userService);

  app.get('/', (_req, res) => {
    res.json({ message: 'API corriendo', docs: '/api-docs' });
  });
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(createSwaggerSpec(port)));
  app.use('/api/users', createUserRouter(userController));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

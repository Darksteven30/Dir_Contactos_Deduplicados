import express, { type Express } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createAuthenticate } from '../../src/shared/middlewares/authenticate';
import { requireRole, requireSelfOrAdmin } from '../../src/shared/middlewares/authorize';
import { errorHandler } from '../../src/shared/middlewares/errorHandler';
import { JwtAccessTokenService } from '../../src/shared/security/accessToken';

const SECRET = 'secreto-de-pruebas-con-al-menos-32-caracteres';
const tokens = new JwtAccessTokenService(SECRET, 900);

const bearer = (userId: number, role: 'user' | 'admin') => `Bearer ${tokens.sign({ userId, role })}`;

describe('Middlewares de autenticación y autorización', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    const authenticate = createAuthenticate(tokens);
    app.get('/admin', authenticate, requireRole('admin'), (_req, res) => {
      res.json({ ok: true });
    });
    app.get('/users/:id', authenticate, requireSelfOrAdmin(), (req, res) => {
      res.json({ auth: req.auth });
    });
    app.use(errorHandler);
  });

  describe('authenticate', () => {
    it('responde 401 sin token', async () => {
      await request(app).get('/users/1').expect(401);
    });

    it('responde 401 con un token mal firmado', async () => {
      const forged = jwt.sign({ role: 'admin' }, 'otro-secreto-cualquiera-de-32-caracteres!', { subject: '1' });
      await request(app).get('/users/1').set('Authorization', `Bearer ${forged}`).expect(401);
    });

    it('responde 401 con un token expirado', async () => {
      const expired = jwt.sign({ role: 'user', exp: Math.floor(Date.now() / 1000) - 10 }, SECRET, {
        subject: '1',
      });
      await request(app).get('/users/1').set('Authorization', `Bearer ${expired}`).expect(401);
    });

    it('responde 401 con un token sin firma (alg "none")', async () => {
      const unsigned = jwt.sign({ role: 'admin' }, '', { algorithm: 'none', subject: '1' });
      await request(app).get('/users/1').set('Authorization', `Bearer ${unsigned}`).expect(401);
    });

    it('expone la identidad en req.auth con un token válido', async () => {
      const res = await request(app).get('/users/7').set('Authorization', bearer(7, 'user')).expect(200);
      expect(res.body).toEqual({ auth: { userId: 7, role: 'user' } });
    });
  });

  describe('requireRole', () => {
    it('responde 403 a un usuario sin el rol requerido', async () => {
      await request(app).get('/admin').set('Authorization', bearer(1, 'user')).expect(403);
    });

    it('deja pasar al rol requerido', async () => {
      await request(app).get('/admin').set('Authorization', bearer(1, 'admin')).expect(200);
    });
  });

  describe('requireSelfOrAdmin', () => {
    it('responde 403 si un usuario accede al recurso de otro', async () => {
      await request(app).get('/users/2').set('Authorization', bearer(1, 'user')).expect(403);
    });

    it('permite al admin acceder a cualquier usuario', async () => {
      await request(app).get('/users/2').set('Authorization', bearer(1, 'admin')).expect(200);
    });
  });
});

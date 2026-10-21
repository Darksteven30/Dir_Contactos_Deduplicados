import { Router, type RequestHandler } from 'express';
import { requireRole, requireSelfOrAdmin } from '../../shared/middlewares/authorize';
import type { UserController } from './user.controller';

/**
 * @swagger
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 1
 *         name:
 *           type: string
 *           example: Juan Pérez
 *         email:
 *           type: string
 *           example: juan@example.com
 *         role:
 *           type: string
 *           enum: [user, admin]
 *         createdAt:
 *           type: string
 *           format: date-time
 *     UserInput:
 *       type: object
 *       required: [name, email, password]
 *       properties:
 *         name:
 *           type: string
 *           example: Juan Pérez
 *         email:
 *           type: string
 *           example: juan@example.com
 *         password:
 *           type: string
 *           minLength: 8
 *           example: secreto123
 *         role:
 *           type: string
 *           enum: [user, admin]
 *           default: user
 *     UserUpdate:
 *       type: object
 *       required: [name, email]
 *       properties:
 *         name:
 *           type: string
 *           example: Juan Actualizado
 *         email:
 *           type: string
 *           example: juan2@example.com
 *     Error:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: false
 *         message:
 *           type: string
 *         details:
 *           type: object
 */
export function createUserRouter(controller: UserController, authenticate: RequestHandler): Router {
  const router = Router();

  // Todas las rutas de usuarios requieren sesión. Listar, crear y eliminar es solo para admin;
  // consultar y editar un usuario lo puede hacer el propio usuario o un admin.
  router.use(authenticate);

  /**
   * @swagger
   * /api/users:
   *   get:
   *     summary: Obtener todos los usuarios (admin)
   *     tags: [Users]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       401:
   *         description: No autenticado
   *       403:
   *         description: Sin permiso
   *       200:
   *         description: Lista de usuarios
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 data:
   *                   type: array
   *                   items:
   *                     $ref: '#/components/schemas/User'
   */
  router.get('/', requireRole('admin'), controller.getAll);

  /**
   * @swagger
   * /api/users/{id}:
   *   get:
   *     summary: Obtener usuario por ID (propio o admin)
   *     tags: [Users]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       401:
   *         description: No autenticado
   *       403:
   *         description: Sin permiso
   *       200:
   *         description: Usuario encontrado
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 data:
   *                   $ref: '#/components/schemas/User'
   *       400:
   *         description: ID inválido
   *       404:
   *         description: Usuario no encontrado
   */
  router.get('/:id', requireSelfOrAdmin(), controller.getById);

  /**
   * @swagger
   * /api/users:
   *   post:
   *     summary: Crear usuario (admin)
   *     tags: [Users]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/UserInput'
   *     responses:
   *       401:
   *         description: No autenticado
   *       403:
   *         description: Sin permiso
   *       201:
   *         description: Usuario creado exitosamente
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 data:
   *                   $ref: '#/components/schemas/User'
   *       400:
   *         description: Datos inválidos
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       409:
   *         description: Email ya registrado
   */
  router.post('/', requireRole('admin'), controller.create);

  /**
   * @swagger
   * /api/users/{id}:
   *   put:
   *     summary: Actualizar usuario (propio o admin)
   *     tags: [Users]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/UserUpdate'
   *     responses:
   *       401:
   *         description: No autenticado
   *       403:
   *         description: Sin permiso
   *       200:
   *         description: Usuario actualizado
   *       400:
   *         description: Datos inválidos
   *       404:
   *         description: Usuario no encontrado
   *       409:
   *         description: Email ya registrado por otro usuario
   */
  router.put('/:id', requireSelfOrAdmin(), controller.update);

  /**
   * @swagger
   * /api/users/{id}:
   *   delete:
   *     summary: Eliminar usuario (admin)
   *     tags: [Users]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       401:
   *         description: No autenticado
   *       403:
   *         description: Sin permiso
   *       204:
   *         description: Usuario eliminado
   *       404:
   *         description: Usuario no encontrado
   */
  router.delete('/:id', requireRole('admin'), controller.remove);

  return router;
}

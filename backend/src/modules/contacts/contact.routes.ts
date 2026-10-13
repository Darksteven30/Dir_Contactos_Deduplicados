import { Router, type RequestHandler } from 'express';
import type { ContactController } from './contact.controller';

/**
 * @swagger
 * components:
 *   schemas:
 *     Contact:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 1
 *         ownerId:
 *           type: integer
 *           example: 1
 *         fullName:
 *           type: string
 *           example: José Pérez
 *         email:
 *           type: string
 *           nullable: true
 *           example: jose.perez@example.com
 *         phone:
 *           type: string
 *           nullable: true
 *           example: +57 300 123 4567
 *         company:
 *           type: string
 *           nullable: true
 *           example: Acme S.A.S.
 *         notes:
 *           type: string
 *           nullable: true
 *         version:
 *           type: integer
 *           description: Versión para bloqueo optimista; se envía al actualizar.
 *           example: 1
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     ScoredContact:
 *       allOf:
 *         - $ref: '#/components/schemas/Contact'
 *         - type: object
 *           properties:
 *             score:
 *               type: number
 *               description: Similitud con la búsqueda, de 0 a 1.
 *               example: 0.857
 *     ContactInput:
 *       type: object
 *       required: [fullName]
 *       properties:
 *         fullName:
 *           type: string
 *           maxLength: 150
 *           example: José Pérez
 *         email:
 *           type: string
 *           nullable: true
 *           example: jose.perez@example.com
 *         phone:
 *           type: string
 *           nullable: true
 *           description: Dígitos, espacios, +, -, () y al menos 7 dígitos.
 *           example: +57 300 123 4567
 *         company:
 *           type: string
 *           nullable: true
 *           example: Acme S.A.S.
 *         notes:
 *           type: string
 *           nullable: true
 *           maxLength: 2000
 *     ContactUpdate:
 *       allOf:
 *         - $ref: '#/components/schemas/ContactInput'
 *         - type: object
 *           required: [version]
 *           properties:
 *             version:
 *               type: integer
 *               description: Versión que se leyó del contacto. Si cambió entretanto, responde 409.
 *               example: 1
 *     ContactPage:
 *       type: object
 *       properties:
 *         items:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Contact'
 *         total:
 *           type: integer
 *           example: 42
 *         page:
 *           type: integer
 *           example: 1
 *         pageSize:
 *           type: integer
 *           example: 20
 *   parameters:
 *     ContactId:
 *       in: path
 *       name: id
 *       required: true
 *       schema:
 *         type: integer
 *     Page:
 *       in: query
 *       name: page
 *       schema:
 *         type: integer
 *         minimum: 1
 *         default: 1
 *     PageSize:
 *       in: query
 *       name: pageSize
 *       schema:
 *         type: integer
 *         minimum: 1
 *         maximum: 100
 *         default: 20
 */
export function createContactRouter(
  controller: ContactController,
  authenticate: RequestHandler,
  requireContactOwner: RequestHandler,
): Router {
  const router = Router();

  // Todas las rutas requieren sesión. Las que reciben :id verifican además que el
  // contacto pertenezca al usuario autenticado (403 si es de otro, 404 si no existe).
  router.use(authenticate);

  /**
   * @swagger
   * /api/contacts:
   *   get:
   *     summary: Listar mis contactos (paginado, orden alfabético)
   *     tags: [Contacts]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - $ref: '#/components/parameters/Page'
   *       - $ref: '#/components/parameters/PageSize'
   *     responses:
   *       200:
   *         description: Página de contactos
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 data:
   *                   $ref: '#/components/schemas/ContactPage'
   *       401:
   *         description: No autenticado
   */
  router.get('/', controller.list);

  /**
   * @swagger
   * /api/contacts/search:
   *   get:
   *     summary: Búsqueda difusa de contactos
   *     description: >
   *       Compara el texto contra el nombre por similitud de trigramas (tolera errores de escritura,
   *       tildes y mayúsculas) y busca fragmentos dentro del email y del teléfono.
   *       Los resultados se ordenan por `score` descendente.
   *     tags: [Contacts]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: q
   *         required: true
   *         schema:
   *           type: string
   *           maxLength: 100
   *         example: jose peres
   *       - $ref: '#/components/parameters/Page'
   *       - $ref: '#/components/parameters/PageSize'
   *     responses:
   *       200:
   *         description: Contactos que coinciden, con su score
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 data:
   *                   allOf:
   *                     - $ref: '#/components/schemas/ContactPage'
   *                     - type: object
   *                       properties:
   *                         items:
   *                           type: array
   *                           items:
   *                             $ref: '#/components/schemas/ScoredContact'
   *       400:
   *         description: Falta el texto de búsqueda
   *       401:
   *         description: No autenticado
   */
  router.get('/search', controller.search);

  /**
   * @swagger
   * /api/contacts/{id}:
   *   get:
   *     summary: Obtener uno de mis contactos
   *     tags: [Contacts]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - $ref: '#/components/parameters/ContactId'
   *     responses:
   *       200:
   *         description: Contacto encontrado
   *       403:
   *         description: El contacto pertenece a otro usuario
   *       404:
   *         description: Contacto no encontrado
   */
  router.get('/:id', requireContactOwner, controller.getById);

  /**
   * @swagger
   * /api/contacts:
   *   post:
   *     summary: Crear un contacto
   *     tags: [Contacts]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/ContactInput'
   *     responses:
   *       201:
   *         description: Contacto creado
   *       400:
   *         description: Datos inválidos
   */
  router.post('/', controller.create);

  /**
   * @swagger
   * /api/contacts/{id}:
   *   put:
   *     summary: Actualizar uno de mis contactos (bloqueo optimista)
   *     description: >
   *       Hay que enviar la `version` que se leyó. Si el contacto cambió entretanto responde 409
   *       y en `details.current` devuelve la versión vigente para resolver el conflicto.
   *     tags: [Contacts]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - $ref: '#/components/parameters/ContactId'
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/ContactUpdate'
   *     responses:
   *       200:
   *         description: Contacto actualizado (con la versión incrementada)
   *       400:
   *         description: Datos inválidos
   *       403:
   *         description: El contacto pertenece a otro usuario
   *       404:
   *         description: Contacto no encontrado
   *       409:
   *         description: Conflicto de versión
   */
  router.put('/:id', requireContactOwner, controller.update);

  /**
   * @swagger
   * /api/contacts/{id}:
   *   delete:
   *     summary: Eliminar uno de mis contactos (borrado lógico)
   *     tags: [Contacts]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - $ref: '#/components/parameters/ContactId'
   *     responses:
   *       204:
   *         description: Contacto eliminado
   *       403:
   *         description: El contacto pertenece a otro usuario
   *       404:
   *         description: Contacto no encontrado
   */
  router.delete('/:id', requireContactOwner, controller.remove);

  return router;
}

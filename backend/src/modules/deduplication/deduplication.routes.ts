import { Router, type RequestHandler } from 'express';
import type { DeduplicationController } from './deduplication.controller';

/**
 * @swagger
 * components:
 *   schemas:
 *     ContactMatch:
 *       type: object
 *       properties:
 *         score:
 *           type: number
 *           description: Probabilidad de que sean la misma persona (0 a 1).
 *           example: 0.92
 *         nameSimilarity:
 *           type: number
 *           description: Similitud de nombres por distancia de Levenshtein (0 a 1).
 *           example: 0.9
 *         emailMatch:
 *           type: boolean
 *           nullable: true
 *           description: null si alguno no tiene email.
 *         phoneMatch:
 *           type: boolean
 *           nullable: true
 *           description: null si alguno no tiene teléfono.
 *     DuplicatePair:
 *       allOf:
 *         - $ref: '#/components/schemas/ContactMatch'
 *         - type: object
 *           properties:
 *             contactIds:
 *               type: array
 *               items:
 *                 type: integer
 *               example: [3, 7]
 *     DuplicateGroup:
 *       type: object
 *       properties:
 *         score:
 *           type: number
 *           example: 0.92
 *         suggestedPrimaryId:
 *           type: integer
 *           description: Contacto más completo, sugerido como principal al fusionar.
 *           example: 3
 *         contacts:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Contact'
 *         pairs:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/DuplicatePair'
 *     SimilarContact:
 *       type: object
 *       properties:
 *         contact:
 *           $ref: '#/components/schemas/Contact'
 *         match:
 *           $ref: '#/components/schemas/ContactMatch'
 *   parameters:
 *     MinScore:
 *       in: query
 *       name: minScore
 *       description: Puntaje mínimo para considerar dos contactos duplicados.
 *       schema:
 *         type: number
 *         minimum: 0.5
 *         maximum: 1
 *         default: 0.8
 */
export function createDeduplicationRouter(controller: DeduplicationController, authenticate: RequestHandler): Router {
  const router = Router();

  // Todas las operaciones trabajan solo sobre los contactos del usuario autenticado.
  router.use(authenticate);

  /**
   * @swagger
   * /api/contacts/duplicates:
   *   get:
   *     summary: Grupos de contactos posiblemente duplicados
   *     description: >
   *       Busca pares candidatos con trigramas (nombre parecido, mismo email o mismo teléfono),
   *       los puntúa con distancia de Levenshtein y agrupa los que superan `minScore`
   *       (si A≈B y B≈C, los tres quedan en un grupo). Excluye los pares descartados.
   *     tags: [Duplicates]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - $ref: '#/components/parameters/MinScore'
   *     responses:
   *       200:
   *         description: Grupos ordenados por score descendente
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
   *                     $ref: '#/components/schemas/DuplicateGroup'
   *       401:
   *         description: No autenticado
   */
  router.get('/', controller.groups);

  /**
   * @swagger
   * /api/contacts/duplicates/check:
   *   post:
   *     summary: Verificar si un contacto nuevo ya existe
   *     description: No guarda nada; devuelve los contactos existentes parecidos a los datos enviados.
   *     tags: [Duplicates]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - $ref: '#/components/parameters/MinScore'
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/ContactInput'
   *     responses:
   *       200:
   *         description: Contactos parecidos, del más al menos parecido
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
   *                     $ref: '#/components/schemas/SimilarContact'
   *       400:
   *         description: Datos inválidos
   */
  router.post('/check', controller.check);

  /**
   * @swagger
   * /api/contacts/duplicates/dismissals:
   *   post:
   *     summary: Marcar dos contactos como "no son duplicados"
   *     description: El par deja de sugerirse en los grupos de duplicados.
   *     tags: [Duplicates]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [contactIds]
   *             properties:
   *               contactIds:
   *                 type: array
   *                 minItems: 2
   *                 maxItems: 2
   *                 items:
   *                   type: integer
   *                 example: [3, 7]
   *     responses:
   *       204:
   *         description: Par descartado
   *       400:
   *         description: Datos inválidos
   *       404:
   *         description: Algún contacto no existe o es de otro usuario
   */
  router.post('/dismissals', controller.dismiss);

  return router;
}

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
 *         mergePreview:
 *           $ref: '#/components/schemas/ContactInput'
 *           description: Resultado de fusionar el grupo con el principal sugerido.
 *         contacts:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Contact'
 *         pairs:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/DuplicatePair'
 *     VersionedContactRef:
 *       type: object
 *       required: [id, version]
 *       properties:
 *         id:
 *           type: integer
 *           example: 3
 *         version:
 *           type: integer
 *           description: Versión que leyó el cliente (bloqueo optimista).
 *           example: 1
 *     MergeInput:
 *       type: object
 *       required: [primary, duplicates]
 *       properties:
 *         primary:
 *           $ref: '#/components/schemas/VersionedContactRef'
 *         duplicates:
 *           type: array
 *           minItems: 1
 *           maxItems: 20
 *           items:
 *             $ref: '#/components/schemas/VersionedContactRef'
 *         contact:
 *           $ref: '#/components/schemas/ContactInput'
 *           description: Opcional. Datos finales elegidos por el usuario; si se omite, se combinan automáticamente.
 *     ContactMerge:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         primaryContactId:
 *           type: integer
 *         mergedContactIds:
 *           type: array
 *           items:
 *             type: integer
 *         before:
 *           type: array
 *           description: Todos los contactos (principal incluido) tal como estaban antes de fusionar.
 *           items:
 *             $ref: '#/components/schemas/ContactInput'
 *         createdAt:
 *           type: string
 *           format: date-time
 *         undoneAt:
 *           type: string
 *           format: date-time
 *           nullable: true
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

  /**
   * @swagger
   * /api/contacts/duplicates/merges:
   *   post:
   *     summary: Fusionar contactos duplicados en un contacto principal
   *     description: >
   *       Operación atómica (transacción ACID). Bloquea los contactos con SELECT ... FOR UPDATE,
   *       verifica que sus versiones sean las que leyó el cliente, actualiza el principal, hace
   *       borrado lógico de los duplicados y guarda una foto de todos en el historial para poder
   *       deshacerla. Si no se envía `contact`, los datos se combinan automáticamente: se completan
   *       los campos vacíos del principal y los valores distintos que no se eligieron se anotan en las notas.
   *     tags: [Duplicates]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/MergeInput'
   *     responses:
   *       201:
   *         description: Contactos fusionados
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 data:
   *                   type: object
   *                   properties:
   *                     merge:
   *                       $ref: '#/components/schemas/ContactMerge'
   *                     contact:
   *                       $ref: '#/components/schemas/Contact'
   *       400:
   *         description: Datos inválidos
   *       404:
   *         description: Algún contacto no existe, ya fue eliminado o fusionado, o es de otro usuario
   *       409:
   *         description: Algún contacto cambió desde que se leyó; `details.current` trae las versiones vigentes
   *   get:
   *     summary: Historial de fusiones
   *     description: De la más reciente a la más antigua.
   *     tags: [Duplicates]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *           default: 1
   *       - in: query
   *         name: pageSize
   *         schema:
   *           type: integer
   *           default: 20
   *           maximum: 100
   *     responses:
   *       200:
   *         description: Página del historial
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 data:
   *                   type: object
   *                   properties:
   *                     page:
   *                       type: integer
   *                     pageSize:
   *                       type: integer
   *                     total:
   *                       type: integer
   *                     items:
   *                       type: array
   *                       items:
   *                         $ref: '#/components/schemas/ContactMerge'
   */
  router.post('/merges', controller.merge);
  router.get('/merges', controller.mergeHistory);

  /**
   * @swagger
   * /api/contacts/duplicates/merges/{id}/undo:
   *   post:
   *     summary: Deshacer una fusión
   *     description: >
   *       Restaura el contacto principal y los duplicados tal como estaban antes de fusionar.
   *       Solo se permite si el principal no cambió después de la fusión.
   *     tags: [Duplicates]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Contactos restaurados
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
   *                     $ref: '#/components/schemas/Contact'
   *       404:
   *         description: La fusión no existe o es de otro usuario
   *       409:
   *         description: La fusión ya fue deshecha, o el principal cambió después de fusionar
   */
  router.post('/merges/:id/undo', controller.undoMerge);

  return router;
}

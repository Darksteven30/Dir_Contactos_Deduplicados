import type { Request, Response } from 'express';
import { ok } from '../../shared/http/response';
import type { UserService } from './user.service';
import { createUserSchema, updateUserSchema, userIdParamsSchema } from './user.schemas';

// Capa HTTP: valida la entrada, delega en el servicio y da forma a la respuesta.
// Los errores (Zod o de dominio) los traduce el middleware global errorHandler.
export class UserController {
  constructor(private readonly service: UserService) {}

  getAll = async (_req: Request, res: Response): Promise<void> => {
    res.json(ok(await this.service.list()));
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const { id } = userIdParamsSchema.parse(req.params);
    res.json(ok(await this.service.getById(id)));
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const dto = createUserSchema.parse(req.body);
    res.status(201).json(ok(await this.service.create(dto)));
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const { id } = userIdParamsSchema.parse(req.params);
    const dto = updateUserSchema.parse(req.body);
    res.json(ok(await this.service.update(id, dto)));
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    const { id } = userIdParamsSchema.parse(req.params);
    await this.service.remove(id);
    res.status(204).send();
  };
}

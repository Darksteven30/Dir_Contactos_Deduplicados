import type { Request, Response } from 'express';
import { UnauthorizedError } from '../../shared/errors/AppError';
import { ok } from '../../shared/http/response';
import type { ContactService } from './contact.service';
import {
  contactIdParamsSchema,
  contactInputSchema,
  listContactsQuerySchema,
  searchContactsQuerySchema,
  updateContactSchema,
} from './contact.schemas';

// El dueño de los contactos es siempre el usuario autenticado, nunca un dato del cliente.
function ownerOf(req: Request): number {
  if (!req.auth) throw new UnauthorizedError();
  return req.auth.userId;
}

// Capa HTTP: valida la entrada, delega en el servicio y da forma a la respuesta.
export class ContactController {
  constructor(private readonly service: ContactService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const page = listContactsQuerySchema.parse(req.query);
    res.json(ok(await this.service.list(ownerOf(req), page)));
  };

  search = async (req: Request, res: Response): Promise<void> => {
    const query = searchContactsQuerySchema.parse(req.query);
    res.json(ok(await this.service.search(ownerOf(req), query)));
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const { id } = contactIdParamsSchema.parse(req.params);
    res.json(ok(await this.service.getById(ownerOf(req), id)));
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const dto = contactInputSchema.parse(req.body);
    res.status(201).json(ok(await this.service.create(ownerOf(req), dto)));
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const { id } = contactIdParamsSchema.parse(req.params);
    const dto = updateContactSchema.parse(req.body);
    res.json(ok(await this.service.update(ownerOf(req), id, dto)));
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    const { id } = contactIdParamsSchema.parse(req.params);
    await this.service.remove(ownerOf(req), id);
    res.status(204).send();
  };
}

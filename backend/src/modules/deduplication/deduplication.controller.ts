import type { Request, Response } from 'express';
import { UnauthorizedError } from '../../shared/errors/AppError';
import { ok } from '../../shared/http/response';
import { contactInputSchema } from '../contacts/contact.schemas';
import type { DeduplicationService } from './deduplication.service';
import {
  dismissPairSchema,
  mergeContactsSchema,
  mergeHistoryQuerySchema,
  mergeIdParamsSchema,
  minScoreQuerySchema,
} from './deduplication.schemas';

function ownerOf(req: Request): number {
  if (!req.auth) throw new UnauthorizedError();
  return req.auth.userId;
}

export class DeduplicationController {
  constructor(private readonly service: DeduplicationService) {}

  groups = async (req: Request, res: Response): Promise<void> => {
    const { minScore } = minScoreQuerySchema.parse(req.query);
    res.json(ok(await this.service.findDuplicateGroups(ownerOf(req), minScore)));
  };

  check = async (req: Request, res: Response): Promise<void> => {
    const { minScore } = minScoreQuerySchema.parse(req.query);
    const draft = contactInputSchema.parse(req.body);
    res.json(ok(await this.service.findSimilar(ownerOf(req), draft, minScore)));
  };

  dismiss = async (req: Request, res: Response): Promise<void> => {
    const { contactIds } = dismissPairSchema.parse(req.body);
    await this.service.dismissPair(ownerOf(req), contactIds);
    res.status(204).send();
  };

  merge = async (req: Request, res: Response): Promise<void> => {
    const dto = mergeContactsSchema.parse(req.body);
    res.status(201).json(ok(await this.service.merge(ownerOf(req), dto)));
  };

  mergeHistory = async (req: Request, res: Response): Promise<void> => {
    const page = mergeHistoryQuerySchema.parse(req.query);
    res.json(ok(await this.service.listMerges(ownerOf(req), page)));
  };

  undoMerge = async (req: Request, res: Response): Promise<void> => {
    const { id } = mergeIdParamsSchema.parse(req.params);
    res.json(ok(await this.service.undoMerge(ownerOf(req), id)));
  };
}

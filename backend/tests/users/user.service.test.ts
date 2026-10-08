import { beforeEach, describe, expect, it } from 'vitest';
import { UserService } from '../../src/modules/users/user.service';
import { ConflictError, NotFoundError } from '../../src/shared/errors/AppError';
import { fakeHasher, InMemoryUserRepository } from '../support/inMemoryRepositories';

describe('UserService', () => {
  let repo: InMemoryUserRepository;
  let service: UserService;

  beforeEach(() => {
    repo = new InMemoryUserRepository();
    service = new UserService(repo, fakeHasher);
  });

  it('crea un usuario guardando la contraseña hasheada y sin exponerla', async () => {
    const user = await service.create({ name: 'Ana', email: 'ana@test.com', password: 'secreto123', role: 'user' });

    expect(user).not.toHaveProperty('passwordHash');
    expect((await repo.findByEmail('ana@test.com'))?.passwordHash).toBe('hashed:secreto123');
  });

  it('rechaza crear un usuario con un email ya registrado', async () => {
    await service.create({ name: 'Ana', email: 'ana@test.com', password: 'secreto123', role: 'user' });

    await expect(
      service.create({ name: 'Otra', email: 'ana@test.com', password: 'secreto456', role: 'user' }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('lanza NotFoundError al buscar un usuario inexistente', async () => {
    await expect(service.getById(99)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('permite actualizar un usuario conservando su propio email', async () => {
    const ana = await service.create({ name: 'Ana', email: 'ana@test.com', password: 'secreto123', role: 'user' });

    const updated = await service.update(ana.id, { name: 'Ana María', email: 'ana@test.com' });

    expect(updated.name).toBe('Ana María');
  });

  it('rechaza actualizar al email de otro usuario', async () => {
    await service.create({ name: 'Ana', email: 'ana@test.com', password: 'secreto123', role: 'user' });
    const beto = await service.create({ name: 'Beto', email: 'beto@test.com', password: 'secreto123', role: 'user' });

    await expect(
      service.update(beto.id, { name: 'Beto', email: 'ana@test.com' }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('lanza NotFoundError al eliminar un usuario inexistente', async () => {
    await expect(service.remove(99)).rejects.toBeInstanceOf(NotFoundError);
  });
});

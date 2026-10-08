import { beforeEach, describe, expect, it } from 'vitest';
import type { User, UserWithPassword } from '../../src/modules/users/user.entity';
import type { NewUserData, UserChanges, UserRepository } from '../../src/modules/users/user.repository';
import { UserService } from '../../src/modules/users/user.service';
import { ConflictError, NotFoundError } from '../../src/shared/errors/AppError';
import type { PasswordHasher } from '../../src/shared/security/passwordHasher';

class InMemoryUserRepository implements UserRepository {
  private rows: UserWithPassword[] = [];
  private nextId = 1;

  private static toPublic({ passwordHash: _hash, ...user }: UserWithPassword): User {
    return user;
  }

  async findAll(): Promise<User[]> {
    return this.rows.map(InMemoryUserRepository.toPublic);
  }

  async findById(id: number): Promise<User | null> {
    const row = this.rows.find((u) => u.id === id);
    return row ? InMemoryUserRepository.toPublic(row) : null;
  }

  async findByEmail(email: string): Promise<UserWithPassword | null> {
    return this.rows.find((u) => u.email === email) ?? null;
  }

  async create(data: NewUserData): Promise<User> {
    const row: UserWithPassword = { id: this.nextId++, createdAt: new Date(), ...data };
    this.rows.push(row);
    return InMemoryUserRepository.toPublic(row);
  }

  async update(id: number, changes: UserChanges): Promise<User | null> {
    const row = this.rows.find((u) => u.id === id);
    if (!row) return null;
    Object.assign(row, changes);
    return InMemoryUserRepository.toPublic(row);
  }

  async delete(id: number): Promise<boolean> {
    const before = this.rows.length;
    this.rows = this.rows.filter((u) => u.id !== id);
    return this.rows.length < before;
  }
}

const fakeHasher: PasswordHasher = {
  hash: async (plain) => `hashed:${plain}`,
  compare: async (plain, hash) => hash === `hashed:${plain}`,
};

describe('UserService', () => {
  let repo: InMemoryUserRepository;
  let service: UserService;

  beforeEach(() => {
    repo = new InMemoryUserRepository();
    service = new UserService(repo, fakeHasher);
  });

  it('crea un usuario guardando la contraseña hasheada y sin exponerla', async () => {
    const user = await service.create({ name: 'Ana', email: 'ana@test.com', password: 'secreto123' });

    expect(user).not.toHaveProperty('passwordHash');
    expect((await repo.findByEmail('ana@test.com'))?.passwordHash).toBe('hashed:secreto123');
  });

  it('rechaza crear un usuario con un email ya registrado', async () => {
    await service.create({ name: 'Ana', email: 'ana@test.com', password: 'secreto123' });

    await expect(
      service.create({ name: 'Otra', email: 'ana@test.com', password: 'secreto456' }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('lanza NotFoundError al buscar un usuario inexistente', async () => {
    await expect(service.getById(99)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('permite actualizar un usuario conservando su propio email', async () => {
    const ana = await service.create({ name: 'Ana', email: 'ana@test.com', password: 'secreto123' });

    const updated = await service.update(ana.id, { name: 'Ana María', email: 'ana@test.com' });

    expect(updated.name).toBe('Ana María');
  });

  it('rechaza actualizar al email de otro usuario', async () => {
    await service.create({ name: 'Ana', email: 'ana@test.com', password: 'secreto123' });
    const beto = await service.create({ name: 'Beto', email: 'beto@test.com', password: 'secreto123' });

    await expect(
      service.update(beto.id, { name: 'Beto', email: 'ana@test.com' }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('lanza NotFoundError al eliminar un usuario inexistente', async () => {
    await expect(service.remove(99)).rejects.toBeInstanceOf(NotFoundError);
  });
});

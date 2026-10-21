import { ConflictError, NotFoundError } from '../../shared/errors/AppError';
import type { PasswordHasher } from '../../shared/security/passwordHasher';
import type { User } from './user.entity';
import type { UserRepository } from './user.repository';
import type { CreateUserDto, UpdateUserDto } from './user.schemas';

// Reglas de negocio de usuarios. No conoce HTTP ni SQL: recibe sus dependencias por constructor.
export class UserService {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
  ) {}

  list(): Promise<User[]> {
    return this.users.findAll();
  }

  async getById(id: number): Promise<User> {
    const user = await this.users.findById(id);
    if (!user) throw new NotFoundError('Usuario no encontrado');
    return user;
  }

  async create(dto: CreateUserDto): Promise<User> {
    if (await this.users.findByEmail(dto.email)) {
      throw new ConflictError('El email ya está registrado');
    }
    const passwordHash = await this.hasher.hash(dto.password);
    return this.users.create({ name: dto.name, email: dto.email, passwordHash, role: dto.role });
  }

  async update(id: number, dto: UpdateUserDto): Promise<User> {
    const owner = await this.users.findByEmail(dto.email);
    if (owner && owner.id !== id) {
      throw new ConflictError('El email ya está registrado');
    }
    const user = await this.users.update(id, dto);
    if (!user) throw new NotFoundError('Usuario no encontrado');
    return user;
  }

  async remove(id: number): Promise<void> {
    if (!(await this.users.delete(id))) {
      throw new NotFoundError('Usuario no encontrado');
    }
  }
}

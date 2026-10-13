import type { ContactData } from '../../modules/contacts/contact.entity';

/**
 * Datos de prueba para desarrollo y demostración (`npm run seed`).
 *
 * Los contactos del usuario demo están armados a propósito: cada escenario es un grupo
 * que la deduplicación debe detectar, y los contactos únicos no deben agruparse con nadie
 * (algunos son trampas: se parecen, pero no son la misma persona).
 */

export interface SeedUser {
  name: string;
  email: string;
  password: string;
  contacts: ContactData[];
}

export interface DuplicateScenario {
  description: string;
  contacts: ContactData[];
}

const contact = (fullName: string, fields: Partial<Omit<ContactData, 'fullName'>> = {}): ContactData => ({
  fullName,
  email: null,
  phone: null,
  company: null,
  notes: null,
  ...fields,
});

export const DUPLICATE_SCENARIOS: DuplicateScenario[] = [
  {
    description: 'Mismo nombre con tildes, mayúsculas y formato de teléfono distintos',
    contacts: [
      contact('José Pérez', { email: 'jose.perez@gmail.com', phone: '300 123 4567', company: 'Bancolombia' }),
      contact('jose perez', { phone: '+57 300 123 4567' }),
      contact('JOSÉ PÉREZ', { email: 'Jose.Perez@Gmail.com' }),
    ],
  },
  {
    description: 'Nombres y apellidos en orden invertido',
    contacts: [
      contact('María Fernanda López', { email: 'mafe.lopez@hotmail.com' }),
      contact('López María Fernanda', { company: 'Universidad Santiago de Cali' }),
    ],
  },
  {
    description: 'Errores de escritura en el nombre',
    contacts: [
      contact('Carlos Andrés Ramírez', { phone: '315 222 3344', company: 'Emcali' }),
      contact('Carlos Andres Ramires', { notes: 'Lo conocí en el congreso de software' }),
    ],
  },
  {
    description: 'Apodo distinto pero mismo email',
    contacts: [
      contact('Alejandro Gómez', { email: 'alejo.gomez@outlook.com', phone: '318 765 4321' }),
      contact('Alejo Gómez', { email: 'alejo.gomez@outlook.com' }),
    ],
  },
  {
    description: 'Mismo teléfono escrito con y sin indicativo de país',
    contacts: [
      contact('Diana Torres', { phone: '(311) 555-7890' }),
      contact('Diana Carolina Torres', { phone: '+57 311 555 7890', company: 'Carvajal' }),
    ],
  },
  {
    description: 'Agrupación transitiva: A se parece a B por nombre y B a C por email (A y C no comparten nada)',
    contacts: [
      contact('Juan Esteban Ruiz', { phone: '316 111 2233' }),
      contact('Juan Esteban Ruíz', { email: 'je.ruiz@gmail.com' }),
      contact('Juancho', { email: 'je.ruiz@gmail.com', notes: 'Compañero del colegio' }),
    ],
  },
  {
    description: 'Un apellido omitido',
    contacts: [
      contact('Valentina Restrepo Mejía', { company: 'Tecnoquímicas' }),
      contact('Valentina Restrepo', { notes: 'Contacto de LinkedIn' }),
    ],
  },
  {
    description: 'Falso positivo: nombres casi iguales sin más datos (sirve para probar "no son duplicados")',
    contacts: [contact('Daniel Rojas'), contact('Daniela Rojas')],
  },
];

export const UNIQUE_CONTACTS: ContactData[] = [
  // Trampa: nombres casi iguales, pero email y teléfono distintos.
  contact('Andrea Mejía', { email: 'andrea.mejia@gmail.com', phone: '320 444 5566' }),
  contact('Andrés Mejía', { email: 'andres.mejia@yahoo.com', phone: '321 999 8877' }),
  contact('Laura Castillo', { email: 'laura.castillo@gmail.com', company: 'Colombina' }),
  contact('Santiago Herrera', { phone: '312 345 6789' }),
  contact('Camila Ortiz', { email: 'camila.ortiz@icloud.com', notes: 'Diseñadora UX' }),
  contact('Ricardo Vargas', { company: 'Banco de Occidente' }),
  contact('Natalia Quintero', { phone: '317 888 1122', email: 'nquintero@gmail.com' }),
  contact('Felipe Moreno'),
];

export const DEMO_PASSWORD = 'demo12345';

export const SEED_USERS: SeedUser[] = [
  {
    name: 'Usuario Demo',
    email: 'demo@example.com',
    password: DEMO_PASSWORD,
    contacts: [...DUPLICATE_SCENARIOS.flatMap((scenario) => scenario.contacts), ...UNIQUE_CONTACTS],
  },
  {
    // Segundo usuario para comprobar la privacidad: su "José Pérez" nunca se cruza con el del demo.
    name: 'Otro Usuario',
    email: 'otro@example.com',
    password: DEMO_PASSWORD,
    contacts: [
      contact('José Pérez', { email: 'jose.perez@gmail.com', phone: '300 123 4567' }),
      contact('Paula Cardona', { email: 'paula.cardona@gmail.com' }),
    ],
  },
];

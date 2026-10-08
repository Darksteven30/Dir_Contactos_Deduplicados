# Dir_Contactos_Deduplicados

Directorio de contactos con deduplicación: búsqueda difusa (Levenshtein / trigramas) para sugerir la fusión de contactos redundantes.

## Estructura

```
backend/   API REST (Node.js + Express + TypeScript + PostgreSQL + Swagger)
frontend/  SPA (Vue 3 + TypeScript + Pinia + Vue Router + Vitest)
```

### Arquitectura del backend

```
backend/
├── migrations/            Migraciones SQL versionadas (NNN_descripcion.sql)
├── src/
│   ├── config/            Variables de entorno (validadas con Zod) y Swagger
│   ├── database/          Pool de PostgreSQL y motor de migraciones
│   ├── modules/<módulo>/  Una carpeta por módulo de negocio:
│   │   ├── *.routes.ts        Rutas + documentación Swagger
│   │   ├── *.controller.ts    Capa HTTP (valida entrada, arma respuesta)
│   │   ├── *.service.ts       Reglas de negocio
│   │   ├── *.repository.ts    Interfaz + implementación PostgreSQL
│   │   ├── *.schemas.ts       Esquemas Zod / DTOs
│   │   └── *.entity.ts        Tipos de dominio
│   ├── shared/            Errores, middlewares y seguridad compartidos
│   ├── app.ts             Composition root (inyección de dependencias)
│   └── server.ts          Punto de entrada
└── tests/                 Pruebas con Vitest
```

Las migraciones se aplican en orden, una sola vez, y se registran en la tabla `schema_migrations`. Para cambiar el esquema se agrega un archivo nuevo; nunca se edita uno ya aplicado.

## Requisitos

- Node.js 20+
- PostgreSQL (administrado con DBeaver)

## Puesta en marcha

### 1. Base de datos

Crear la base de datos `contactos_db` en PostgreSQL (por ejemplo desde DBeaver).

### 2. Backend

```bash
cd backend
cp .env.example .env   # completar DB_PASSWORD y JWT_ACCESS_SECRET
npm install
npm run dev              # aplica migraciones pendientes y arranca en modo watch
```

- API: http://localhost:3000
- Swagger: http://localhost:3000/api-docs

Otros comandos del backend:

| Comando | Descripción |
|---|---|
| `npm run migrate` | Aplica solo las migraciones pendientes |
| `npm test` | Ejecuta las pruebas |
| `npm run typecheck` | Verifica tipos sin compilar |
| `npm run build` / `npm start` | Compila a `dist/` y ejecuta la versión compilada |

Para generar `JWT_ACCESS_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### Autenticación

Flujo de doble token:

- **Access token** (JWT HS256, 15 min): se devuelve en el body y el cliente lo guarda **solo en memoria**. Se envía como `Authorization: Bearer <token>`.
- **Refresh token** (opaco, 7 días): viaja únicamente en la cookie `refresh_token` (`HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/api/auth`). En la base de datos solo se guarda su hash SHA-256.
- **Rotación**: cada `POST /api/auth/refresh` revoca el refresh token usado y entrega uno nuevo. Si se presenta un token ya rotado (posible robo), se revocan **todas** las sesiones del usuario.
- **Revocación**: `POST /api/auth/logout` cierra la sesión actual; `POST /api/auth/logout-all` cierra todas.
- **Rate limiting**: 10 intentos cada 15 min por IP en registro y login.

| Endpoint | Acceso |
|---|---|
| `POST /api/auth/register`, `/login`, `/refresh`, `/logout` | Público |
| `GET /api/auth/me`, `POST /api/auth/logout-all` | Autenticado |
| `GET /api/users`, `POST /api/users`, `DELETE /api/users/:id` | Solo `admin` |
| `GET /api/users/:id`, `PUT /api/users/:id` | El propio usuario o `admin` |

Para convertir un usuario en administrador (desde DBeaver):

```sql
UPDATE users SET role = 'admin' WHERE email = 'tu@email.com';
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

- App: http://localhost:5173

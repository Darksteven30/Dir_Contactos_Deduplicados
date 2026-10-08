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
cp .env.example .env   # completar DB_PASSWORD
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

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

- App: http://localhost:5173

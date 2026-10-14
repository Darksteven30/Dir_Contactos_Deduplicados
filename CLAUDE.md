# CLAUDE.md

Contexto del proyecto para Claude Code. Responder siempre en **español**.

## Proyecto

Proyecto individual del curso *Programación orientada a la Web* (Universidad Santiago de Cali, semestre 8).
Es el **tema 9** de la guía del curso: **Directorio de Contactos con Deduplicación**, con búsqueda difusa
(Levenshtein / trigramas) para sugerir la fusión de contactos redundantes.

- Repositorio: https://github.com/Darksteven30/Dir_Contactos_Deduplicados
- Stack: backend Node.js + Express 5 + TypeScript + PostgreSQL (administrado con DBeaver);
  frontend Vue 3 + TypeScript + Pinia + Vue Router + Vitest.
- El backend nace de la plantilla `backweb` (Express + PostgreSQL en JS) que entregó el docente, migrada a TypeScript.
- La guía y la rúbrica están en el PDF `clasetemas.pdf` del material del curso (fuera del repo).
- La arquitectura, los endpoints y los algoritmos están documentados en el [README](README.md): leerlo antes de cambiar algo.

## Forma de trabajo (obligatorio)

- **El usuario hace él mismo los commits, el push y los Pull Requests.** No ejecutar `git commit`, `git push`
  ni `gh pr create`. Al terminar una tarea, entregar:
  1. Los comandos `git add` + `git commit -m "..."`, agrupados como en el historial (feat / test / docs).
  2. `git push -u origin <rama>`.
  3. El título y la descripción del PR (en Markdown, con resumen, cambios, verificación y cómo probar).
  4. Los pasos posteriores al merge: `git checkout develop`, `git pull`, borrar la rama **local**
     (`git branch -d <rama>`), borrar la rama **remota** (`git push origin --delete <rama>`) y `git fetch --prune`.
- Ramas: `feature/<nombre>` creadas desde `develop`; los PR van hacia `develop`. `main` recibe `develop` en cada entrega.
- Commits convencionales en español: `feat(backend): ...`, `test(backend): ...`, `docs: ...`, `chore: ...`, `refactor: ...`.
- Antes de entregar: `npm run typecheck` y `npm test` en `backend/` sin errores, y probar contra PostgreSQL real
  cuando el cambio toque la base de datos (las pruebas unitarias usan repositorios en memoria).
- Al terminar una rama, actualizar la sección **Avance** de este archivo.

## Convenciones del código

- Capas por módulo (`backend/src/modules/<módulo>/`): routes → controller → service → repository, con inyección
  de dependencias en `src/app.ts` (composition root). El servicio no conoce HTTP ni SQL.
- TypeScript estricto: **cero `any`**. Validación de entrada con Zod en los controladores.
- Errores de dominio con las clases de `shared/errors/AppError.ts`; el `errorHandler` global los traduce a HTTP.
- Toda consulta de contactos filtra por `owner_id`: un usuario nunca ve datos de otro (ni siendo admin).
- **Nunca editar una migración ya aplicada**: cada cambio de esquema es un archivo nuevo `NNN_descripcion.sql`.
- Transacciones con `withTransaction` (`src/database/transaction.ts`); concurrencia con `version`
  (bloqueo optimista) y `SELECT ... FOR UPDATE` en orden de id (bloqueo pesimista).
- Comentarios y mensajes de la API en español.

## Comandos (`backend/`)

| Comando | Uso |
|---|---|
| `npm run dev` | Aplica migraciones pendientes y arranca en modo watch (http://localhost:3000, Swagger en `/api-docs`) |
| `npm run migrate` | Solo aplica migraciones pendientes |
| `npm run seed` | Datos de prueba: `demo@example.com` y `otro@example.com`, contraseña `demo12345` |
| `npm test` / `npm run typecheck` | Pruebas (Vitest) / verificación de tipos |

En un PC nuevo: crear la base `contactos_db` en DBeaver, copiar `backend/.env.example` a `backend/.env`
(pedir al usuario `DB_PASSWORD`; generar `JWT_ACCESS_SECRET`) y correr `npm install`, `npm run migrate` y `npm run seed`.
El `.env` no está en Git y no debe subirse.

## Avance (plan por ramas)

| # | Rama | Estado |
|---|---|---|
| — | Estructura, backend TS, auth JWT doble token, CRUD de contactos, deduplicación | ✅ PR #1–#5 |
| 1 | `feature/datos-prueba` | ✅ PR #6: `npm run seed` con 8 escenarios de duplicados |
| 2 | `feature/fusion-contactos` | ✅ PR #7: fusión transaccional, historial y deshacer |
| 3 | `feature/resiliencia` | ⏳ Siguiente: logs estructurados (pino) con `x-correlation-id`, `helmet`, `app.set('trust proxy', 1)`, cola en memoria (limpieza de refresh tokens expirados o importación CSV + escaneo de duplicados) |
| 4 | `feature/frontend-base` | Pendiente: cliente HTTP tipado con interceptores (Bearer + un reintento vía `/api/auth/refresh` ante 401), store de auth con el access token **solo en memoria** (nunca localStorage), navigation guards asíncronos, login y registro, proxy de Vite `/api` → `localhost:3000` |
| 5 | `feature/frontend-contactos` | Pendiente: store normalizado (`byId` + `ids`) con carga/error/caché, lista paginada, búsqueda, formulario, pantalla del conflicto 409 (`details.current`) |
| 6 | `feature/frontend-duplicados` | Pendiente: grupos con `mergePreview`, "no son duplicados", fusionar, historial y deshacer |
| 7 | `feature/pruebas-integracion` | Pendiente: pruebas contra PostgreSQL real (bloqueos, `pg_trgm`, fusión) y pruebas del frontend |
| 8 | `feature/despliegue` | Pendiente: Render/Railway + Neon (soporta `pg_trgm`) |

`main` todavía solo tiene el commit inicial: falta el primer PR `develop` → `main`.

## Notas técnicas importantes

- **Cookie del refresh token** (`HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/api/auth`): si en el despliegue el
  frontend y el backend quedan en dominios distintos, el navegador no envía la cookie y la sesión se rompe.
  Servir ambos bajo el mismo dominio (Express sirviendo el build de Vue, o rewrites/proxy).
- Detrás del proxy de la nube hace falta `trust proxy`; si no, el rate limit trata a todos los usuarios como una sola IP.
- La rúbrica pide para la nota máxima: Clean Architecture sin `any`; doble token, ownership y transacciones ACID;
  Pinia normalizado con feedback de carga/error y guards asíncronos; el desafío técnico completo; historial de ramas
  y PR, pruebas unitarias **e integración** y **despliegue en la nube**.

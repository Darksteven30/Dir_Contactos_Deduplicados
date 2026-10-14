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
| `npm run seed` | Carga los datos de prueba (ver abajo) |
| `npm test` | Ejecuta las pruebas |
| `npm run typecheck` | Verifica tipos sin compilar |
| `npm run build` / `npm start` | Compila a `dist/` y ejecuta la versión compilada |

Para generar `JWT_ACCESS_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### Datos de prueba

`npm run seed` aplica las migraciones pendientes y crea dos usuarios (contraseña `demo12345`):

| Usuario | Contactos |
|---|---|
| `demo@example.com` | 26 contactos: 8 escenarios de duplicados y 8 contactos únicos |
| `otro@example.com` | 2 contactos, uno igual a un contacto del demo, para comprobar que los directorios son privados |

Los escenarios están en [`demoData.ts`](backend/src/database/seeds/demoData.ts): tildes y mayúsculas, nombres en orden invertido, errores de escritura, mismo email con otro nombre, mismo teléfono con y sin indicativo, agrupación transitiva, apellido omitido y un falso positivo para probar "no son duplicados". También hay trampas que **no** deben agruparse (por ejemplo, *Andrea Mejía* y *Andrés Mejía*, que tienen email y teléfono distintos). Una prueba automática verifica que la deduplicación encuentre exactamente esos 8 grupos.

El comando es repetible: vuelve a dejar los contactos de esos dos usuarios tal como están en el archivo. No se ejecuta con `NODE_ENV=production`.

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

### Contactos

Cada usuario administra su propio directorio: los contactos son privados (ni un `admin` puede ver los de otro usuario).

| Endpoint | Descripción |
|---|---|
| `GET /api/contacts?page=&pageSize=` | Listado paginado en orden alfabético |
| `GET /api/contacts/search?q=` | Búsqueda difusa, ordenada por `score` (0 a 1) |
| `GET /api/contacts/:id` | Consultar un contacto |
| `POST /api/contacts` | Crear (`fullName` obligatorio; `email`, `phone`, `company`, `notes` opcionales) |
| `PUT /api/contacts/:id` | Reemplazar; exige la `version` leída |
| `DELETE /api/contacts/:id` | Borrado lógico |

- **Pertenencia del recurso**: el middleware `requireOwnership` busca el dueño del contacto `:id` y responde 403 si es de otro usuario (404 si no existe). Además, todas las consultas del repositorio filtran por `owner_id`.
- **Normalización**: al guardar, el backend calcula `normalized_name` (sin tildes, mayúsculas ni puntuación), `normalized_email` y `normalized_phone` (solo dígitos), para comparar contactos sin que influya el formato.
- **Búsqueda difusa**: usa la extensión `pg_trgm` de PostgreSQL con un índice GIN. El nombre se compara por similitud de trigramas (`word_similarity`, umbral 0.6), así que tolera errores de escritura (`jose peres` encuentra a *José Pérez*). También busca fragmentos dentro del email y del teléfono; una coincidencia ahí vale score 1.
- **Bloqueo optimista**: cada contacto tiene una columna `version`. Un `PUT` con una versión desactualizada responde **409** y en `details.current` devuelve la versión vigente para resolver el conflicto.

### Deduplicación

| Endpoint | Descripción |
|---|---|
| `GET /api/contacts/duplicates?minScore=0.8` | Grupos de contactos posiblemente duplicados |
| `POST /api/contacts/duplicates/check` | Contactos parecidos a uno que se va a crear (no guarda nada) |
| `POST /api/contacts/duplicates/dismissals` | Marcar un par como "no son duplicados" (`{ "contactIds": [3, 7] }`) |

La detección funciona en dos fases:

1. **Candidatos (PostgreSQL)**: en vez de comparar todos los contactos contra todos (O(n²)), un self-join devuelve solo los pares con alguna señal de parecido: nombre similar por trigramas (operador `%` de `pg_trgm`, umbral 0.3, usa el índice GIN), mismo email o mismo teléfono (últimos 10 dígitos, para ignorar el indicativo). Se excluyen los pares descartados por el usuario.
2. **Puntaje (TypeScript)**: cada par se califica de 0 a 1 en [`contactSimilarity.ts`](backend/src/modules/deduplication/contactSimilarity.ts):
   - **Nombre** con distancia de **Levenshtein** propia ([`levenshtein.ts`](backend/src/shared/algorithms/levenshtein.ts)), tomando la mejor de tres comparaciones: nombre completo, palabras ordenadas (*Pérez José* = *José Pérez*) y palabra por palabra (tolera un apellido omitido).
   - **Promedio ponderado**: nombre 0.5, email 0.3, teléfono 0.2. Solo cuentan los campos que ambos contactos tienen.
   - **Pisos**: un email idéntico asegura un score de al menos 0.85 y un teléfono idéntico, de al menos 0.8.

Los pares con `score >= minScore` (0.8 por defecto) se agrupan con **Union-Find** ([`unionFind.ts`](backend/src/shared/algorithms/unionFind.ts)): si A≈B y B≈C, los tres quedan en un grupo. Cada grupo trae el detalle de cada par (`nameSimilarity`, `emailMatch`, `phoneMatch`), un `suggestedPrimaryId` (el contacto más completo, que será el principal al fusionar) y un `mergePreview` con el resultado de la fusión sugerida.

### Fusión de contactos

| Endpoint | Descripción |
|---|---|
| `POST /api/contacts/duplicates/merges` | Fusionar duplicados en un contacto principal |
| `GET /api/contacts/duplicates/merges?page=&pageSize=` | Historial de fusiones, de la más reciente a la más antigua |
| `POST /api/contacts/duplicates/merges/:id/undo` | Deshacer una fusión |

Cuerpo de la fusión (cada contacto con la `version` que leyó el cliente):

```json
{
  "primary": { "id": 3, "version": 1 },
  "duplicates": [{ "id": 7, "version": 2 }],
  "contact": { "fullName": "José Pérez", "email": "jose@gmail.com" }
}
```

`contact` es opcional. Si se omite, los datos se combinan automáticamente ([`contactMerge.ts`](backend/src/modules/deduplication/contactMerge.ts)): se conservan el nombre y los datos del principal, sus campos vacíos se completan con los de los duplicados, las notas se juntan y los valores distintos que no se eligieron (por ejemplo, un segundo email) se anotan en las notas, para no perder información.

La fusión es **una sola transacción ACID**:

1. `SELECT ... FOR UPDATE` bloquea el principal y los duplicados, siempre en orden de `id` para evitar deadlocks. Dos fusiones simultáneas sobre los mismos contactos se ejecutan una tras otra, y la segunda responde 404 porque los duplicados ya no existen.
2. **Bloqueo optimista**: si la `version` de algún contacto no coincide con la enviada, responde **409** con las versiones vigentes en `details.current`, y no modifica nada.
3. Actualiza el principal, hace borrado lógico de los duplicados y guarda en `contact_merges` una foto de todos los contactos tal como estaban.

**Deshacer** restaura esa foto en otra transacción. Solo se permite si el principal no se editó después de la fusión (se compara su `version`); si cambió, responde 409 para no borrar esos cambios.

### Resiliencia y observabilidad

- **Correlation id**: cada petición recibe un id en el header `x-correlation-id`. Si el cliente envía uno válido, se reutiliza; si no, se genera. Se devuelve en la respuesta y en el cuerpo de los errores (`correlationId`), para que un fallo reportado se encuentre en los logs.
- **Logs estructurados** con [pino](https://getpino.io): una línea JSON por evento, con nivel, hora, `correlationId` y datos del evento. Gracias a `AsyncLocalStorage`, cualquier log emitido durante una petición o un trabajo lleva su id sin pasarlo a mano. Cada petición registra método, ruta, código y duración (`info` si va bien, `warn` en 4xx, `error` en 5xx). En desarrollo se ven legibles y con colores, y los tokens y contraseñas nunca se escriben.
- **Manejo global de excepciones**: los errores inesperados se registran con su stack, y al cliente solo le llega un 500 genérico con el `correlationId`.
- **Cola en memoria** ([`jobQueue.ts`](backend/src/shared/queue/jobQueue.ts)) para tareas asíncronas: concurrencia limitada, reintentos con backoff exponencial (1 s, 2 s, 4 s…) y logs de cada intento. La usa la limpieza periódica de refresh tokens vencidos (`TOKEN_CLEANUP_INTERVAL_MINUTES`, 60 por defecto).
- **Seguridad HTTP**: `helmet` agrega los headers de seguridad (CSP, `nosniff`, protección contra clickjacking, HSTS) y oculta `X-Powered-By`.
- **`GET /health`**: verifica la conexión con PostgreSQL (200 o 503). Lo usan las plataformas de despliegue.
- **Apagado ordenado**: ante `SIGTERM` o `SIGINT` el servidor deja de aceptar conexiones, termina las peticiones en curso y los trabajos de la cola, y cierra el pool de PostgreSQL.
- **Detrás de un proxy** (Render, Railway…): configurar `TRUST_PROXY=1` para que el rate limit vea la IP real de cada usuario.

Variables nuevas en `.env` (ver `.env.example`): `LOG_LEVEL`, `TRUST_PROXY`, `TOKEN_CLEANUP_INTERVAL_MINUTES`. Todas tienen valor por defecto.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

- App: http://localhost:5173

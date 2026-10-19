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

Con el backend corriendo en otra terminal:

```bash
cd frontend
npm install
npm run dev
```

- App: http://localhost:5173 (con `npm run seed`, entrar con `demo@example.com` / `demo12345`)
- En desarrollo, Vite reenvía `/api` y `/health` al backend (`localhost:3000`). Así el navegador ve un solo origen y la cookie del refresh token funciona sin configurar CORS.

| Comando | Descripción |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run test:unit` | Pruebas (Vitest + Vue Test Utils) |
| `npm run type-check` | Verificación de tipos (`vue-tsc`) |
| `npm run lint` / `npm run format` | oxlint + ESLint / Prettier |
| `npm run build` | Build de producción en `dist/` |

#### Arquitectura del frontend

```
frontend/src/
├── api/          Cliente HTTP (Axios) y funciones tipadas por recurso (auth.ts, contacts.ts)
├── stores/       Estado global con Pinia (auth.ts, contacts.ts, toasts.ts)
├── router/       Rutas y navigation guards
├── views/        Páginas (una por ruta)
├── components/
│   ├── base/     Componentes reutilizables: botón, campos, tarjeta, alerta, modal, paginación, íconos
│   ├── contacts/ Formulario, conflicto 409, aviso de duplicados, avatar
│   └── layout/   Encabezado, menú y avisos (toasts)
├── composables/  Lógica reutilizable (debounce)
└── types/        Contratos de la API (los mismos que devuelve el backend)
```

Las vistas usan los stores; los stores usan las funciones de `src/api`; solo `src/api/http.ts` conoce Axios. Los estilos son de **Tailwind CSS** y casi todos viven en los componentes base.

#### Sesión en el frontend

- **Access token solo en memoria** (store `auth` de Pinia), nunca en `localStorage` ni `sessionStorage`, donde un ataque XSS podría leerlo. Al recargar la página, `restoreSession()` pide uno nuevo con la cookie HttpOnly del refresh token, que JavaScript no puede leer.
- **Cliente HTTP con interceptores** ([`http.ts`](frontend/src/api/http.ts)):
  - agrega `Authorization: Bearer` y un `x-correlation-id` a cada petición;
  - ante un **401** renueva la sesión **una sola vez** (aunque fallen varias peticiones a la vez) y repite la petición original; si no se puede renovar, vuelve al login avisando que la sesión expiró;
  - **reintenta automáticamente** las lecturas (GET) ante fallos de red o 502/503/504, con backoff exponencial. Las peticiones que modifican datos nunca se repiten solas;
  - convierte todo error en un `ApiError` con un mensaje para el usuario y los errores por campo.
- **Navigation guards asíncronos**: antes de la primera navegación se espera a recuperar la sesión, así recargar una página privada no manda al login a quien sí tiene sesión. Las rutas privadas sin sesión redirigen al login y recuerdan el destino; después de iniciar sesión se vuelve ahí, aceptando solo rutas internas para evitar *open redirects*.
- **Estados de carga y error explícitos** en el store (`pending`, `error`): botones con indicador de carga, errores del servidor y validación por campo.

#### Contactos en el frontend

Pantalla `/contactos` (la raíz `/` lleva ahí). Los datos de la cuenta están en `/cuenta`.

- **Store normalizado** ([`contacts.ts`](frontend/src/stores/contacts.ts)): `byId` guarda cada contacto una sola vez y `ids` el orden de la página visible. Si un contacto aparece en el listado y en una búsqueda, editarlo lo actualiza en ambos.
- **Caché por consulta** (texto + página + tamaño) durante 30 s: volver a una página ya vista no hace otra petición. Crear, editar o borrar invalida la caché.
- **Estados explícitos** `idle` / `loading` / `success` / `error`: esqueleto mientras carga la primera vez, lista atenuada al refrescar, error con botón *Reintentar* y estados vacíos ("Aún no tienes contactos" y "No encontramos contactos").
- **Respuestas fuera de orden**: si el usuario escribe rápido, solo se aplica la respuesta de la última búsqueda.
- **Búsqueda difusa** con *debounce* (300 ms). El texto y la página viven en la URL (`/contactos?q=jose&page=2`), así se puede recargar, compartir y usar atrás/adelante. Cada resultado muestra su porcentaje de parecido.
- **Paginación** con tamaño de página elegible (10, 20 o 50). Esa preferencia es lo único que se guarda en el navegador (**persistencia selectiva**): los contactos siempre vienen del servidor.
- **Crear y editar** en una ventana modal con validación por campo (las mismas reglas que el backend). Al crear, mientras se escribe, se consulta `POST /duplicates/check` y se avisa si ya existe un contacto parecido, con opción de editar ese en lugar de crear otro.
- **Conflicto de edición (409)**: si otra sesión guardó el contacto antes, se muestra una tabla con las diferencias (*tu versión* frente a *versión actual*) y el usuario elige **usar la versión actual** o **guardar sus cambios** sobre la versión vigente.
- **Borrado optimista**: el contacto desaparece de inmediato y vuelve si el servidor rechaza la operación.

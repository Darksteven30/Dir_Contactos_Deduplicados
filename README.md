# Dir_Contactos_Deduplicados

Directorio de contactos con deduplicación: búsqueda difusa (Levenshtein / trigramas) para sugerir la fusión de contactos redundantes.

## Estructura

```
backend/   API REST (Node.js + Express + PostgreSQL + Swagger)
frontend/  SPA (Vue 3 + TypeScript + Pinia + Vue Router + Vitest)
```

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
npm run dev
```

- API: http://localhost:3000
- Swagger: http://localhost:3000/api-docs

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

- App: http://localhost:5173

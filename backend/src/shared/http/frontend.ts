import { existsSync } from 'node:fs';
import path from 'node:path';
import express, { Router } from 'express';

// Rutas del backend: nunca se responden con la app de Vue (un /api inexistente debe dar 404 JSON).
const BACKEND_PREFIXES = ['/api', '/api-docs', '/health', '/assets'];

const isBackendPath = (urlPath: string) =>
  BACKEND_PREFIXES.some((prefix) => urlPath === prefix || urlPath.startsWith(`${prefix}/`));

/**
 * Sirve el frontend compilado (Vue) desde el mismo servidor y dominio que la API.
 * Es lo que permite que la cookie del refresh token (SameSite=Strict) viaje en producción.
 *
 * - `/assets/*` llevan un hash en el nombre: el navegador los guarda un año.
 * - Cualquier otra ruta GET (/contactos, /duplicados...) recibe index.html y Vue Router decide
 *   qué mostrar. index.html no se guarda en caché, para que cada despliegue se vea al instante.
 *
 * Devuelve null si la carpeta no tiene un build (p. ej. en desarrollo, donde lo sirve Vite).
 */
export function createFrontendRouter(distDir: string): Router | null {
  const indexHtml = path.join(distDir, 'index.html');
  if (!existsSync(indexHtml)) return null;

  const router = Router();
  router.use('/assets', express.static(path.join(distDir, 'assets'), { immutable: true, maxAge: '1y' }));
  router.use(express.static(distDir, { index: false }));
  router.get(/.*/, (req, res, next) => {
    if (isBackendPath(req.path)) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indexHtml);
  });
  return router;
}

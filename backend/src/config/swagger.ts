import path from 'node:path';
import swaggerJsdoc from 'swagger-jsdoc';

// Rutas de los archivos con anotaciones @swagger. Sirve tanto en desarrollo (.ts) como en build (.js).
const routeFiles = path
  .join(__dirname, '../modules/**/*.routes.{ts,js}')
  .replace(/\\/g, '/');

export function createSwaggerSpec(port: number): object {
  return swaggerJsdoc({
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'Directorio de Contactos API',
        version: '1.0.0',
        description: 'API REST del Directorio de Contactos con Deduplicación',
      },
      servers: [{ url: `http://localhost:${port}`, description: 'Servidor local' }],
    },
    apis: [routeFiles],
  });
}

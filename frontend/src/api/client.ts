import { createHttpClient, type AuthHooks } from './http'

// Mientras el store de autenticación no se conecte, el cliente funciona sin sesión.
const authBridge: AuthHooks = {
  getAccessToken: () => null,
  refreshSession: async () => null,
  onSessionExpired: () => undefined,
}

/** Cliente HTTP de la aplicación. Los módulos de `src/api` lo usan; las vistas y los stores no. */
export const http = createHttpClient({
  getAccessToken: () => authBridge.getAccessToken(),
  refreshSession: () => authBridge.refreshSession(),
  onSessionExpired: () => authBridge.onSessionExpired(),
})

/** Conecta el cliente con el store de autenticación (se llama una vez, en main.ts). */
export function connectAuth(hooks: AuthHooks): void {
  Object.assign(authBridge, hooks)
}

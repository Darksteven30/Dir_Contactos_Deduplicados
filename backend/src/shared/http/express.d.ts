import type { AuthContext } from '../security/accessToken';

// Extiende Request de Express con la identidad que agrega el middleware authenticate.
declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export {};

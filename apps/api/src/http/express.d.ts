import type { Logger } from 'pino';
import type { SessionPrincipal } from '../auth/session-store.js';

declare global {
  namespace Express {
    interface Request {
      id: string;
      principal?: SessionPrincipal;
      sessionId?: string;
      csrfToken?: string;
      log?: Logger;
    }
  }
}

export {};

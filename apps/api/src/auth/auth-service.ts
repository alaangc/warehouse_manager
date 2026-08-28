import argon2 from 'argon2';
import type { AppDatabase } from '../db/database.js';
import { HttpProblem } from '../http/problem-handler.js';
import { SessionStore, type CreatedSession } from './session-store.js';

export interface AuthenticationGateway {
  login(username: string, password: string): Promise<CreatedSession>;
  findSession(id: string): ReturnType<SessionStore['find']>;
  matchesCsrf(hash: string, token: string): boolean;
  logout(id: string): Promise<void>;
}

export class AuthService implements AuthenticationGateway {
  constructor(
    private readonly database: AppDatabase,
    private readonly sessions = new SessionStore(database),
  ) {}

  async login(username: string, password: string): Promise<CreatedSession> {
    const user = await this.database
      .selectFrom('app_user')
      .selectAll()
      .where((eb) => eb('username', '=', username.trim().toLowerCase()))
      .executeTakeFirst();
    if (!user || !user.active || !(await argon2.verify(user.password_hash, password))) {
      // Keep the public failure identical for unknown, inactive, and wrong-password accounts.
      throw new HttpProblem(
        401,
        'INVALID_CREDENTIALS',
        'Authentication Required',
        'The username or password is incorrect.',
      );
    }
    return this.sessions.create({
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      role: user.role,
      active: user.active,
    });
  }

  findSession(id: string) {
    return this.sessions.find(id);
  }
  matchesCsrf(hash: string, token: string) {
    return this.sessions.matchesCsrf(hash, token);
  }
  logout(id: string) {
    return this.sessions.revoke(id);
  }
}

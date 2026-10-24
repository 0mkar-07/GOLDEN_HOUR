import crypto from 'node:crypto';

export interface SessionData {
  sessionId: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
}

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const sessions = new Map<string, SessionData>();

export function createSession(userId: string): SessionData {
  const sessionId = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const session: SessionData = {
    sessionId,
    userId,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
  };
  sessions.set(sessionId, session);
  return session;
}

export function getSession(sessionId: string): SessionData | undefined {
  const session = sessions.get(sessionId);
  if (!session) return undefined;
  if (Date.now() > session.expiresAt) {
    sessions.delete(sessionId);
    return undefined;
  }
  return session;
}

export function destroySession(sessionId: string): void {
  sessions.delete(sessionId);
}

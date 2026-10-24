import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'node:http';
import { UserRole } from '@goldenhour/contracts';
import { store } from '../../db/store.js';
import { getSession } from '../auth/session.js';
import { SESSION_COOKIE_NAME } from '../auth/plugin.js';

let io: SocketIOServer | null = null;

export function initSocketIO(httpServer: HttpServer) {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: true,
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // Socket Authentication & Room Authorization Middleware
  io.use((socket: Socket, next) => {
    const cookieHeader = socket.handshake.headers.cookie;
    if (!cookieHeader) {
      // Allow unauthenticated connection with limited public broadcast for demo
      return next();
    }

    // Parse session cookie
    const match = cookieHeader.match(new RegExp(`(^|;\\s*)${SESSION_COOKIE_NAME}=([^;]*)`));
    const sessionId = match ? decodeURIComponent(match[2]) : null;

    if (sessionId) {
      const session = getSession(sessionId);
      if (session) {
        const user = store.getUserById(session.userId);
        if (user && user.active) {
          (socket as any).user = user;
        }
      }
    }
    next();
  });

  io.on('connection', (socket: Socket) => {
    const user = (socket as any).user;

    // Join authorized rooms
    if (user) {
      // All authenticated users join general case room
      socket.join('ambulance:cases');

      // Hospital users join their specific hospital room
      if (user.role === UserRole.HOSPITAL && user.hospitalId) {
        socket.join(`hospital:${user.hospitalId}`);
      }

      // Admin users join admin global room
      if (user.role === UserRole.ADMIN) {
        socket.join('admin');
        socket.join('hospital:hosp-001');
        socket.join('hospital:hosp-002');
      }
    } else {
      // Default demo room
      socket.join('ambulance:cases');
    }

    socket.on('disconnect', () => {
      // Clean disconnect
    });
  });

  return io;
}

export function getIO(): SocketIOServer | null {
  return io;
}

/**
 * Single-process Real-Time Event Dispatcher with Envelope
 */
export function emitRealtimeEvent(
  authorizedEventType: string,
  entityId: string,
  payload: any,
  targetRoom?: string
) {
  if (!io) return;

  const eventEnvelope = {
    eventId: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    entityId,
    entityVersion: payload?.version ?? 1,
    authorizedEventType,
    occurredAt: new Date().toISOString(),
    payload,
  };

  if (targetRoom) {
    io.to(targetRoom).emit(authorizedEventType, eventEnvelope);
  } else {
    // Broadcast to general subscribers
    io.emit(authorizedEventType, eventEnvelope);
  }
}

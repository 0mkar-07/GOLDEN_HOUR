import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io('/', {
      withCredentials: true,
      autoConnect: true,
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      console.log('[Socket.IO] Connected to GoldenHour live real-time server.');
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket.IO] Disconnected:', reason);
    });

    socket.on('connect_error', (err) => {
      console.warn('[Socket.IO] Connection error:', err.message);
    });
  }
  return socket;
}

export function subscribeToRealtimeEvent<T = any>(
  event: string,
  handler: (data: {
    eventId: string;
    entityId: string;
    entityVersion: number;
    authorizedEventType: string;
    occurredAt: string;
    payload: T;
  }) => void
): () => void {
  const s = getSocket();
  s.on(event, handler);
  return () => {
    s.off(event, handler);
  };
}

// Keep existing subscribers, but reauthenticate room membership after account changes.
export function refreshSocketSession(authenticated: boolean): void {
  if (!socket) return;
  socket.disconnect();
  if (authenticated) socket.connect();
}

import { io, Socket } from 'socket.io-client';
import { getTokens } from '@/api/auth/tokenStorage';

let socket: Socket | null = null;
let currentToken: string = '';

export function getSocket(): Socket {
  const tokens = getTokens();
  const token = tokens?.accessToken ?? '';

  // Recreate socket if token changed or disconnected
  if (socket && currentToken !== token) {
    socket.disconnect();
    socket = null;
  }

  if (!socket) {
    currentToken = token;
    const baseUrl = (process.env.NEXT_PUBLIC_API_URL ?? '').replace('/api', '');
    // Connect to namespace /chat
    socket = io(baseUrl + '/chat', {
      path: '/socket.io',
      auth: { token },
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });
  }

  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
  currentToken = '';
}

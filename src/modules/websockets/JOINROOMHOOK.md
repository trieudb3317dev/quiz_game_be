JOINROOMHOOK — Client hook for JoinRoom WebSocket Gateway

This document describes a small, reusable React hook and usage patterns for interacting with the NestJS `JoinRoomGateway` (namespace `/join-room`). It uses `socket.io-client` and assumes authentication is performed via cookies (access_token/refresh_token) as the server gateway uses cookie-based JWT verification.

Contents
- Installation
- Gateway events & payloads
- React hook: `useJoinRoom` (TypeScript)
- Example component
- Notes & tips (cookies, reconnection, multi-tab)


Installation

Install socket.io-client in your frontend project:

```bash
npm install socket.io-client
# or
yarn add socket.io-client
```


Gateway events & payloads (server -> client)
- `userJoined` — broadcast when joiners change for a given room (scoped to `room_<id>` room):
  - payload: { roomId: number, data: { data: Joiner[], pagination?: {...} } }
  - Each Joiner in `data.data` has structure like:
    - join_room_id
    - user_id
    - username
    - full_name
    - room_id
    - room_name
    - answers: [ { answer_select_id, select_count, created_at, quiz_id, quiz_title, answer_id, answer_text, is_correct } ]

Server expects client -> server messages (socket.io "emit"):
- `joinRoom` — payload: { roomId: number }
- `leaveRoom` — payload: { roomId: number }

The server will emit `joinedRoom` and `leftRoom` acknowledgement events to the requesting socket as well (payload: { roomId }) and will broadcast `userJoined` to sockets joined in that `room_<id>`.


React hook: useJoinRoom (TypeScript)

- Behavior:
  - Connects to namespace `/join-room` using socket.io-client.
  - Sends cookies (withCredentials) so the gateway can verify JWT from cookies.
  - Exposes joinRoom(roomId) and leaveRoom(roomId) functions.
  - Exposes the current list of joiners for the last room update and connection status.
  - Cleans up the socket on unmount.

Add this file (or paste into your frontend client code):

```ts
// useJoinRoom.ts
import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

type Joiner = {
  join_room_id: number;
  user_id: number | null;
  username: string | null;
  full_name: string | null;
  room_id: number | null;
  room_name: string | null;
  answers: any[];
};

export function useJoinRoom({
  url = (window as any).__env?.APP_WS_URL || window.location.origin,
  path = '/socket.io',
  namespace = '/join-room',
  autoConnect = true,
} = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joiners, setJoiners] = useState<Joiner[]>([]);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!autoConnect) return;

    const fullUrl = url.replace(/\/$/, '') + namespace;

    const socket = io(fullUrl, {
      path,
      transports: ['websocket', 'polling'],
      withCredentials: true, // important: send cookies for JWT in cookie
      autoConnect: true,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      setError(null);
      // console.log('socket connected', socket.id);
    });

    socket.on('disconnect', (reason) => {
      setIsConnected(false);
      // console.log('socket disconnected', reason);
    });

    socket.on('connect_error', (err: any) => {
      setError(err?.message || String(err));
    });

    // Listen for broadcast of joiners (scoped to a room)
    socket.on('userJoined', (payload: any) => {
      // payload: { roomId, data }
      if (payload && payload.data) {
        // If server returns { data: [], pagination: ... }
        const d = payload.data?.data ?? payload.data ?? payload;
        setJoiners(Array.isArray(d) ? d : []);
      }
    });

    return () => {
      try {
        socket.off('connect');
        socket.off('disconnect');
        socket.off('connect_error');
        socket.off('userJoined');
        socket.disconnect();
      } catch (e) {
        // ignore cleanup errors
      }
    };
  }, [url, namespace, path, autoConnect]);

  const joinRoom = useCallback(async (roomId: number) => {
    const socket = socketRef.current;
    if (!socket) throw new Error('Socket not initialized');
    socket.emit('joinRoom', { roomId });
  }, []);

  const leaveRoom = useCallback(async (roomId: number) => {
    const socket = socketRef.current;
    if (!socket) throw new Error('Socket not initialized');
    socket.emit('leaveRoom', { roomId });
  }, []);

  return {
    joinRoom,
    leaveRoom,
    joiners,
    isConnected,
    error,
    socket: socketRef.current,
  } as const;
}
```


Example usage in a React component

```tsx
import React from 'react';
import { useJoinRoom } from './useJoinRoom';

export default function RoomView({ roomId }: { roomId: number }) {
  const { joinRoom, leaveRoom, joiners, isConnected, error } = useJoinRoom();

  React.useEffect(() => {
    if (!isConnected) return;
    // join when connected
    joinRoom(roomId).catch(console.error);
    return () => {
      leaveRoom(roomId).catch(console.error);
    };
  }, [isConnected, roomId, joinRoom, leaveRoom]);

  return (
    <div>
      <h3>Room {roomId}</h3>
      <p>Socket: {isConnected ? 'connected' : 'disconnected'}</p>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <ul>
        {joiners.map((j) => (
          <li key={j.join_room_id}>
            {j.username || j.full_name || 'Anonymous'} — answers: {j.answers.length}
          </li>
        ))}
      </ul>
    </div>
  );
}
```


Notes & tips

- Authentication/cookies
  - The gateway authenticates using JWT from cookies. Ensure your frontend sends cookies to the server (same site settings and CORS must allow credentials). In `socket.io-client` set `withCredentials: true` and server CORS should allow credentials.
  - If you're using different domains, ensure cookies are set for the API domain or use subdomain & proper cookie domain.

- Multi-tab behavior
  - If a user is connected from multiple tabs, each socket will independently receive `userJoined` broadcasts when they join/leave.

- Reconnection and backoff
  - `socket.io-client` handles reconnection automatically. You can pass `reconnectionAttempts`, `reconnectionDelay`, and other options to fine-tune behavior.

- Server-side events
  - `joinedRoom` / `leftRoom` are acknowledgement events emitted to the requesting socket. Use them for immediate UI confirmation.
  - `userJoined` is broadcast to the room (room_<id>) and should be used to update the list of joiners in the UI.

- Debugging
  - Enable socket.io client debug by setting `localStorage.debug = '*'` in the browser console before connecting.


That's it — paste the `useJoinRoom` hook into your React app and adapt the example component. If you want I can:
- Provide a minimal non-React JS example (plain JS) for simpler clients.
- Add TypeScript interfaces for payloads to copy into your frontend.
- Add an example for sending answer selects via HTTP or socket (depending on your API design).


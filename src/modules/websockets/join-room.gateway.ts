import {
  WebSocketGateway,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketServer,
  SubscribeMessage,
} from '@nestjs/websockets';
import { OnEvent } from '@nestjs/event-emitter';
import { Socket, Server } from 'socket.io';
import { JoinRoomService } from '../join-rooms/join-room.service';
import { Logger } from '@nestjs/common';
// use socket.io Server for WebSocketServer
import { JwtService } from '@nestjs/jwt';

@WebSocketGateway({
  namespace: '/join-room',
  cors: {
    origin: '*',
  },
  transports: ['websocket', 'polling'],
})
export class JoinRoomGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(JoinRoomGateway.name);

  async handleConnection(client: Socket) {
    this.logger.log(`🔌 Client connected: ${client.id}`);

    // Xác thực ngay khi connect để lưu thông tin user
    const userInfo = await this.authenticateFromCookie(client);
    if (userInfo) {
      // Lưu thông tin user vào socket data
      client.data.user_id = userInfo.user_id;
      client.data.username = userInfo.username;
      this.logger.log(
        `✅ User authenticated: ${userInfo.user_id} (${userInfo.username}) via socket ${client.id}`,
      );
      // Optionally, restore socket to rooms the user is a member of
      // (not implemented here - could query JoinRoomService to join rooms on connect)
    } else {
      this.logger.warn(`❌ Unauthenticated client connected: ${client.id}`);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`🔌 Client disconnected: ${client.id}`);
    // Xử lý người chơi rời phòng
  }

  constructor(
    private readonly joinRoomService: JoinRoomService,
    private readonly jwtService: JwtService,
  ) {}

  // Xác thực JWT token từ cookie
  private async authenticateFromCookie(client: Socket): Promise<{
    user_id: number;
    username: string;
  } | null> {
    try {
      // Lấy cookie từ handshake headers
      const cookies = client.handshake.headers.cookie;
      if (!cookies) {
        this.logger.warn('No cookies found in handshake');
        return null;
      }

      // Parse cookie string để lấy JWT token
      const cookieMap = this.parseCookies(cookies);
      let token = cookieMap['refresh_token'];

      // Nếu không có refresh_token, thử lấy access_token
      if (!token) {
        token = cookieMap['access_token'];
      }

      if (!token) {
        this.logger.warn(
          'No JWT token found in cookies (neither refresh_token nor access_token)',
        );
        return null;
      }

      const payload = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET || 'your-secret-key',
      });
      // AuthService signs tokens with payload.userId (see AuthService.generateJwtToken)
      // Support multiple common claim names as fallbacks for robustness.
      const userId =
        payload.userId || payload.sub || payload.user_id || payload.id;
      const username = payload.username || payload.wallet_address || 'Unknown';
      return {
        user_id: userId,
        username,
      };
    } catch (error) {
      this.logger.error('JWT verification from cookie failed:', error);
      return null;
    }
  }

  // Parse cookie string thành object
  private parseCookies(cookieString: string): Record<string, string> {
    const cookies: Record<string, string> = {};
    cookieString.split(';').forEach((cookie) => {
      const [name, value] = cookie.trim().split('=');
      if (name && value) {
        cookies[name] = decodeURIComponent(value);
      }
    });
    return cookies;
  }

  // Thêm các phương thức xử lý sự kiện WebSocket khác tại đây

  @SubscribeMessage('joinRoom')
  async handleJoinRoom(client: Socket, payload: any) {
    const userId = client.data.user_id;
    const roomId = payload.roomId;
    if (!userId) {
      this.logger.warn(
        `Unauthenticated client ${client.id} attempted to join room ${roomId}`,
      );
      client.emit('error', { message: 'Authentication required to join room' });
      return;
    }
    try {
      await this.joinRoomService.joinRoom(userId, roomId);
      this.logger.log(
        `User ${userId} joined room ${roomId} via socket ${client.id}`,
      );
      // make the socket join a socket.io room so broadcasts can be scoped
      try {
        client.join(`room_${roomId}`);
      } catch (err) {
        this.logger.warn(
          `Failed to join socket.io room for socket ${client.id}: ${err}`,
        );
      }
      client.emit('joinedRoom', { roomId });
      // broadcast updated joiners to members of this room
      await this.broadcastUserJoined(roomId);
    } catch (error) {
      this.logger.error(
        `Failed to join room ${roomId} for user ${userId}: ${error.message}`,
      );
      client.emit('error', { message: 'Failed to join room' });
    }
  }

  @SubscribeMessage('leaveRoom')
  async handleLeaveRoom(client: Socket, payload: any) {
    const userId = client.data.user_id;
    const roomId = payload.roomId;
    if (!userId) {
      this.logger.warn(
        `Unauthenticated client ${client.id} attempted to leave room ${roomId}`,
      );
      client.emit('error', {
        message: 'Authentication required to leave room',
      });
      return;
    }
    try {
      await this.joinRoomService.leaveRoom(userId, roomId);
      this.logger.log(
        `User ${userId} left room ${roomId} via socket ${client.id}`,
      );
      try {
        client.leave(`room_${roomId}`);
      } catch (err) {
        this.logger.warn(
          `Failed to leave socket.io room for socket ${client.id}: ${err}`,
        );
      }
      client.emit('leftRoom', { roomId });
      // broadcast updated joiners to remaining members of this room
      await this.broadcastUserJoined(roomId);
    } catch (error) {
      this.logger.error(
        `Failed to leave room ${roomId} for user ${userId}: ${error.message}`,
      );
      client.emit('error', { message: 'Failed to leave room' });
    }
  }

  @OnEvent('JoinRoom.joined')
  async handleRoomUpdatedEvent(payload: { roomId: number; userId: number }) {
    try {
      const roomId = payload.roomId;
      this.logger.log(`Broadcasting room update for room ${roomId}`);
      await this.broadcastUserJoined(roomId);
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(
          `Error handling JoinRoom.joined event: ${error.message}`,
        );
      }
    }
  }

  private async broadcastUserJoined(roomId: number) {
    try {
      this.logger.log(`Broadcasting user joined for room ${roomId}`);
      const data = await this.joinRoomService.getJoinersByRoom(roomId, {});
      console.log('Broadcast data:', data);
      this.logger.log(`Broadcast data: ${
        Array.isArray(data) ? data.length : (data && data.data ? data.data.length : 'n/a')
      } items`);

      // Count sockets currently in the room (async)
      try {
        const sockets = await this.server.in(`room_${roomId}`).allSockets();
        this.logger.log(`Sockets currently in room_${roomId}: ${sockets.size}`);
      } catch (countErr) {
        this.logger.warn(`Could not count sockets for room_${roomId}: ${countErr}`);
      }

      // Emit only to sockets joined to this room. Some Nest injection returns
      // a Namespace object (when namespace is configured) which doesn't have
      // `of`, so guard the call and fallback to server-level `to`.
      try {
        let emitted = false;
        // If server.of exists (full Server), prefer emitting via namespace
        if (typeof (this.server as any).of === 'function') {
          try {
            const nsp = (this.server as any).of('/join-room');
            if (nsp && typeof nsp.to === 'function') {
              nsp.to(`room_${roomId}`).emit('userJoined', { roomId, data });
              this.logger.log(`Emitted userJoined to namespace /join-room room_${roomId}`);
              emitted = true;
            }
          } catch (innerErr) {
            this.logger.warn(`server.of('/join-room') call failed: ${innerErr}`);
          }
        }

        // Fallback: emit using the injected server (might be Namespace)
        if (!emitted && typeof (this.server as any).to === 'function') {
          (this.server as any).to(`room_${roomId}`).emit('userJoined', { roomId, data });
          this.logger.log(`Emitted userJoined via injected server to room_${roomId}`);
          emitted = true;
        }

        if (!emitted) {
          this.logger.warn(`No available emit method for room_${roomId}`);
        }
      } catch (emitErr) {
        this.logger.error(`Emit failed for room_${roomId}: ${emitErr}`);
      }
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(`Error broadcasting user joined: ${error.message}`);
      }
    }
  }
}

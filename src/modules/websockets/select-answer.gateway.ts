import {
  WebSocketGateway,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketServer,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Socket, Server } from 'socket.io';
import { JoinRoomService } from '../join-rooms/join-room.service';
import { Logger } from '@nestjs/common';
// use socket.io Server for WebSocketServer
import { JwtService } from '@nestjs/jwt';
import { AnsSelectService } from '../ans-selects/ans-select.service';

@WebSocketGateway({
  namespace: '/select-answer',
  cors: {
    origin: '*',
  },
  transports: ['websocket', 'polling'],
})
export class SelectAnswerGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(SelectAnswerGateway.name);
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
    private readonly selectAnswerService: AnsSelectService,
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

  @SubscribeMessage('selectAnswer')
  async handleAnswerSelectedEvent(payload: {
    roomId: number;
    userId: number;
    answerId: number;
  }) {
    try {
      const roomId = payload.roomId;
      const userId = payload.userId;
      const answerId = payload.answerId;
      this.logger.log(`Broadcasting answer selected for room ${roomId}`);
      // Implement broadcasting logic here
      await this.broadcastAnswerSelected(roomId, userId, answerId);
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(
          `Error handling SelectAnswer.selected event: ${error.message}`,
        );
      }
    }
  }

  private async broadcastAnswerSelected(
    roomId: number,
    userId: number,
    answerId: number,
  ) {
    try {
      this.logger.log(`Broadcasting answer selected for room ${roomId}`);
      // Implement broadcasting logic here
      const joiner = await this.joinRoomService.getJoiner(userId, roomId);
      if (!joiner) {
        this.logger.warn(
          `Joiner ${userId} not found in room ${roomId}, cannot broadcast answer selected`,
        );
        return;
      }

      const joinRoomId = joiner.id;

      await this.selectAnswerService.selectAnswer(userId, joinRoomId, answerId);
      // Add broadcasting logic here, for example:
      this.server
        .to(`room_${roomId}`)
        .emit('answerSelected', { joinRoomId, answerId });

      this.logger.log(`Answer selected broadcasted for room ${roomId}`);
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(
          `Error broadcasting answer selected: ${error.message}`,
        );
      }
    }
  }
}

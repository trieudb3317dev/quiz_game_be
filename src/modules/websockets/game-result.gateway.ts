import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  namespace: '/game-result',
  cors: {
    origin: '*',
  },
  transports: ['websocket', 'polling'],
})
export class GameResultGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(GameResultGateway.name);

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

  constructor(private readonly jwtService: JwtService) {}

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
      return {
        user_id: payload.sub || payload.user_id,
        username: payload.username || payload.wallet_address || 'Unknown',
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
  // Implement gateway methods and event handlers as needed
}

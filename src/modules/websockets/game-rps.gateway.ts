// import {
//   WebSocketGateway,
//   WebSocketServer,
//   SubscribeMessage,
//   MessageBody,
//   ConnectedSocket,
//   OnGatewayConnection,
//   OnGatewayDisconnect,
// } from '@nestjs/websockets';
// import { Server, Socket } from 'socket.io';
// import { Injectable, Logger, UseGuards } from '@nestjs/common';
// import { InjectRepository } from '@nestjs/typeorm';
// import { Repository, LessThan } from 'typeorm';
// import { JwtService } from '@nestjs/jwt';
// import { RpsService } from '../games/rps/rps.service';
// import { JwtAuthGuard } from '../auth/jwt-auth.guard';
// import { GameSessions, GameSessionStatus } from '../games/game-session/game-session.entity';
// import { GameRpsResults } from '../games/rps/game-rps-results.entity';
// import { GameRpsTurns } from '../games/rps/game-rps-turns.entity';
// import { SessionCreationService } from '../../shared/queue/session-creation.service';

// interface JoinGameRoomDto {
//   room_id: number;  // Thay đổi từ session_id sang room_id
// }

// interface PlayerChoiceDto {
//   session_id: number;
//   choice: 'rock' | 'paper' | 'scissors';
// }

// interface GameState {
//   status: 'waiting' | 'preparing' | 'running' | 'ended';
//   current_turn: number;
//   players: Player[];
//   turn_start_time: Date;
//   bot_choice: 'wait' | 'rock' | 'paper' | 'scissors';
//   player_choices: Map<number, 'rock' | 'paper' | 'scissors'>; // join_id -> choice
// }

// interface Player {
//   join_id: number;
//   wallet_address: string; // Use wallet_address instead of user_id
//   username: string; // Add username field
//   socket_id: string;
//   status: 'active' | 'eliminated' | 'left';
//   wins: number;      // Số lượng lần thắng
//   losses: number;    // Số lượng lần thua
//   draws: number;     // Số lượng lần hòa
//   points: number;    // Điểm số (thắng +2, hòa +1, thua +0)
//   is_locked: boolean; // Lock người thắng - không chơi lượt tiếp theo
// }

// @WebSocketGateway({
//   cors: {
//     origin: '*',
//   },
//   transports: ['websocket', 'polling'],
//   path: '/socket.io',
//   namespace: '/rps',
// })
// @Injectable() 
// export class GameRpsGateway implements OnGatewayConnection, OnGatewayDisconnect {
//   @WebSocketServer()
//   server: Server;

//   private readonly logger = new Logger(GameRpsGateway.name);
  
//   // Cấu hình thời gian mỗi lượt chơi (giây)
//   private readonly TURN_TIME_LIMIT = 10;
//   // Cấu hình thời gian nghỉ giữa các lượt (giây)
//   private readonly TURN_BREAK_TIME = 3;
//   // Cấu hình thời gian nghỉ trước khi kết thúc game (giây)
//   private readonly GAME_END_DELAY = 3;
//   // Cấu hình thời gian delay trước khi tạo session mới sau khi game kết thúc (giây)
//   private readonly NEW_SESSION_DELAY = 10;
//   // Thời gian chờ reconnect khi disconnect/reload (giây)
//   private readonly DISCONNECT_GRACE_SECONDS = 10;
//   // Cấu hình có gửi bot choice ngay khi bắt đầu lượt không
//   private readonly SEND_BOT_CHOICE_IMMEDIATELY = false;
//   private gameRooms = new Map<number, Set<string>>(); // session_id -> Set<socket_id>
//   private playerSockets = new Map<string, { session_id: number; join_id: number; user_id: number; wallet_address: string }>(); // socket_id -> player_info
//   private walletSockets = new Map<string, Set<string>>(); // wallet_address -> Set<socket_id> (multiple sockets per wallet)
//   private gameStates = new Map<number, GameState>(); // session_id -> game_state
//   private turnTimers = new Map<number, NodeJS.Timeout>(); // session_id -> timer
//   private gameLocks = new Map<number, boolean>(); // session_id -> is_locked
//   private processingEvents = new Set<string>(); // event_id -> is_processing
//   private pendingLeaveTimers = new Map<string, NodeJS.Timeout>(); // key: `${session_id}:${join_id}` -> timer

//   constructor(
//     private readonly rpsService: RpsService,
//     private readonly jwtService: JwtService,
//     @InjectRepository(GameRpsResults)
//     private gameRpsResultsRepository: Repository<GameRpsResults>,
//     @InjectRepository(GameRpsTurns)
//     private gameRpsTurnsRepository: Repository<GameRpsTurns>,
//     private readonly sessionCreationService: SessionCreationService,
//   ) {}

//   async handleConnection(client: Socket) {
//     this.logger.log(`🔌 Client connected: ${client.id}`);
    
//     // Xác thực ngay khi connect để lưu thông tin user
//     const userInfo = await this.authenticateFromCookie(client);
//     if (userInfo) {
//     // Lưu thông tin user vào socket data
//     client.data.user_id = userInfo.user_id;
//     client.data.username = userInfo.username;
//     client.data.wallet_address = userInfo.wallet_address;
//       this.logger.log(`✅ User authenticated: ${userInfo.user_id} (${userInfo.username}) with wallet ${userInfo.wallet_address} via socket ${client.id}`);
//     } else {
//       this.logger.warn(`❌ Unauthenticated client connected: ${client.id}`);
//     }
//   }

//   handleDisconnect(client: Socket) {
//     this.logger.log(`🔌 Client disconnected: ${client.id}`);
    
//     // Xử lý người chơi rời phòng
//     const playerInfo = this.playerSockets.get(client.id);
//     if (playerInfo) {
//       this.logger.log(`👋 Player leaving: ${playerInfo.wallet_address} (join_id: ${playerInfo.join_id}) from session ${playerInfo.session_id}`);
      
//       // Chỉ schedule pending leave nếu là participant (join_id > 0)
//       if (playerInfo.join_id > 0) {
//         this.schedulePendingLeave(playerInfo.session_id, playerInfo.join_id);
//       } else {
//         this.logger.log(`👁️ Watcher leaving: ${playerInfo.wallet_address} from session ${playerInfo.session_id}`);
//       }
      
//       this.playerSockets.delete(client.id);
      
//       // Xóa socket khỏi wallet mapping
//       const walletSockets = this.walletSockets.get(playerInfo.wallet_address);
//       if (walletSockets) {
//         walletSockets.delete(client.id);
//         if (walletSockets.size === 0) {
//       this.walletSockets.delete(playerInfo.wallet_address);
//           this.logger.log(`🗑️ Removed wallet ${playerInfo.wallet_address} (no more sockets)`);
//         } else {
//           this.logger.log(`🗑️ Removed socket ${client.id} from wallet ${playerInfo.wallet_address} (remaining: ${walletSockets.size})`);
//         }
//       }
//     }
//   }

//   // Tạo key timer
//   private buildLeaveKey(session_id: number, join_id: number): string {
//     return `${session_id}:${join_id}`;
//   }

//   // Lên lịch xử lý rời phòng với grace period
//   private async schedulePendingLeave(session_id: number, join_id: number) {
//     const key = this.buildLeaveKey(session_id, join_id);

//     // Nếu đã có timer trước đó thì bỏ qua
//     if (this.pendingLeaveTimers.has(key)) {
//       this.logger.log(`⏳ Pending leave already scheduled for ${key}`);
//       return;
//     }

//     // Phát sự kiện thông báo pending leave (có thể dùng cho UI hiển thị đang chờ reconnect)
//     this.server.to(`rps-room-${session_id}`).emit('player-disconnected', {
//       player_id: join_id,
//       grace_seconds: this.DISCONNECT_GRACE_SECONDS,
//     });
//     this.logger.log(`⏳ Scheduled pending leave for player ${join_id} in session ${session_id} with ${this.DISCONNECT_GRACE_SECONDS}s grace`);

//     const timer = setTimeout(async () => {
//       // Nếu timer còn tồn tại thì mới xử lý rời phòng
//       if (this.pendingLeaveTimers.has(key)) {
//         this.pendingLeaveTimers.delete(key);
//         this.logger.log(`⏰ Grace period expired for ${key}, finalizing leave`);
//         await this.handlePlayerLeave(session_id, join_id);
//       }
//     }, this.DISCONNECT_GRACE_SECONDS * 1000);

//     this.pendingLeaveTimers.set(key, timer);
//   }

//   // Hủy pending leave khi người chơi reconnect
//   private cancelPendingLeave(session_id: number, join_id: number) {
//     const key = this.buildLeaveKey(session_id, join_id);
//     const timer = this.pendingLeaveTimers.get(key);
//     if (timer) {
//       clearTimeout(timer);
//       this.pendingLeaveTimers.delete(key);
//       this.logger.log(`✅ Cancelled pending leave for ${key} due to reconnect`);
//     }
//   }

//   // Xác thực JWT token từ cookie
//   private async authenticateFromCookie(client: Socket): Promise<{ user_id: number; username: string; wallet_address: string } | null> {
//     try {
//       // Lấy cookie từ handshake headers
//       const cookies = client.handshake.headers.cookie;
//       if (!cookies) {
//         this.logger.warn('No cookies found in handshake');
//         return null;
//       }

//       // Parse cookie string để lấy JWT token
//       const cookieMap = this.parseCookies(cookies);
//       let token = cookieMap['refresh_token'];
      
//       // Nếu không có refresh_token, thử lấy access_token
//       if (!token) {
//         token = cookieMap['access_token'];
//       }
      
//       if (!token) {
//         this.logger.warn('No JWT token found in cookies (neither refresh_token nor access_token)');
//         return null;
//       }

//       const payload = this.jwtService.verify(token, {
//         secret: process.env.JWT_SECRET || 'your-secret-key',
//       });
//       return {
//         user_id: payload.sub || payload.user_id,
//         username: payload.username || payload.wallet_address || 'Unknown',
//         wallet_address: payload.wallet_address,
//       };
//     } catch (error) {
//       this.logger.error('JWT verification from cookie failed:', error);
//       return null;
//     }
//   }

//   // Parse cookie string thành object
//   private parseCookies(cookieString: string): Record<string, string> {
//     const cookies: Record<string, string> = {};
//     cookieString.split(';').forEach(cookie => {
//       const [name, value] = cookie.trim().split('=');
//       if (name && value) {
//         cookies[name] = decodeURIComponent(value);
//       }
//     });
//     return cookies;
//   }

//   // Lấy session đang chạy mới nhất từ room_id
//   private async getActiveSessionByRoomId(room_id: number): Promise<number | null> {
//     try {
//       // Lấy tất cả sessions của room, sắp xếp theo thời gian tạo mới nhất
//       const sessions = await this.rpsService.getSessionsByRoomId(room_id);
      
//       // Tìm session đang chạy mới nhất
//       const activeSession = sessions.find(s => s.status === 'running');
      
//       if (activeSession) {
//         this.logger.log(`✅ Found active session ${activeSession.id} for room ${room_id}`);
//         return activeSession.id;
//       } else {
//         this.logger.warn(`⚠️ No active session found for room ${room_id}`);
//         return null;
//       }
//     } catch (error) {
//       this.logger.error(`❌ Error getting active session for room ${room_id}:`, error);
//       return null;
//     }
//   }

//   // Kiểm tra trạng thái game session (sử dụng mock service)
//   private async validateGameSessionStatus(session_id: number): Promise<boolean> {
//     try {
//       const session = await this.rpsService.getGameSession(session_id);
//       if (!session) {
//         this.logger.warn(`Game session ${session_id} not found`);
//         return false;
//       }

//       // Chỉ cho phép join khi session đang ở trạng thái RUNNING
//       if (session.status !== 'running') {
//         this.logger.warn(`Game session ${session_id} is not running, current status: ${session.status}`);
//         return false;
//       }

//       this.logger.log(`✅ Game session ${session_id} is running, status: ${session.status}`);
//       return true;
//     } catch (error) {
//       this.logger.error('Error validating game session status:', error);
//       return false;
//     }
//   }

//   // Kiểm tra user có quyền join room không (sử dụng user_id từ JWT)
//   private async validateUserCanJoin(wallet_address: string, session_id: number, user_id: number): Promise<{ canJoin: boolean; join_id?: number }> {
//     try {
//       // Kiểm tra trạng thái game session trước
//       const sessionValid = await this.validateGameSessionStatus(session_id);
//       if (!sessionValid) {
//         return { canJoin: false };
//       }

//       // Kiểm tra user có trong database không
//       const sessionPlayers = await this.rpsService.getSessionPlayers(session_id);
//       const player = sessionPlayers.find(p => p.user_id?.id === user_id);
      
//       if (!player) {
//         this.logger.warn(`User ${user_id} not found in session ${session_id}`);
//         return { canJoin: false };
//       }

//       // Kiểm tra wallet_address có khớp với user_id không
//       if (player.wallet_address !== wallet_address) {
//         this.logger.warn(`Wallet ${wallet_address} trying to join as user ${user_id} with wallet ${player.wallet_address}`);
//         return { canJoin: false };
//       }

//       // Cho phép cùng wallet mở nhiều tab (bỏ qua kiểm tra wallet đã trong room)
//       // if (this.walletSockets.has(wallet_address)) {
//       //   this.logger.warn(`Wallet ${wallet_address} already in another room`);
//       //   return false;
//       // }

//       return { canJoin: true, join_id: player.id };
//     } catch (error) {
//       this.logger.error('Error validating user:', error);
//       return { canJoin: false };
//     }
//   }

//   // Khởi tạo game state cho phòng mới
//   private initializeGameState(session_id: number): GameState {
//     const gameState: GameState = {
//       status: 'waiting',
//       current_turn: 0,
//       players: [],
//       turn_start_time: new Date(),
//       bot_choice: 'wait',
//       player_choices: new Map(),
//     };
//     this.gameStates.set(session_id, gameState);
//     this.logger.log(`🆕 Initialized new game state for session ${session_id}: status=waiting, turn=0`);
//     return gameState;
//   }

//   // Bot chọn quân ngẫu nhiên
//   private getRandomBotChoice(): 'rock' | 'paper' | 'scissors' {
//     const choices: ('rock' | 'paper' | 'scissors')[] = ['rock', 'paper', 'scissors'];
//     return choices[Math.floor(Math.random() * choices.length)];
//   }

//   // Tính kết quả RPS
//   private calculateRpsResult(playerChoice: string, botChoice: string): 'win' | 'lose' | 'draw' {
//     if (playerChoice === botChoice) return 'draw';
    
//     const winConditions = {
//       'rock': 'scissors',
//       'paper': 'rock',
//       'scissors': 'paper',
//     };
    
//     return winConditions[playerChoice] === botChoice ? 'win' : 'lose';
//   }

//   @SubscribeMessage('join-game-room')
//   async handleJoinGameRoom(
//     @MessageBody() data: JoinGameRoomDto,
//     @ConnectedSocket() client: Socket,
//   ) {
//     const { room_id } = data;
    
//     // Lấy thông tin user từ socket data (đã xác thực khi connect)
//     const wallet_address = client.data.wallet_address;
//     const user_id = client.data.user_id;
    
//     if (!wallet_address || !user_id) {
//       this.logger.warn(`❌ Join failed: No wallet address or user_id for socket ${client.id}`);
//       client.emit('error', { message: 'Authentication required. Please login first.' });
//       return;
//     }

//     // Lấy session đang chạy mới nhất từ room_id
//     const session_id = await this.getActiveSessionByRoomId(room_id);
//     if (!session_id) {
//       this.logger.warn(`❌ Join failed: No active session found for room ${room_id}`);
//       client.emit('error', { message: 'The game session has ended' });
//       return;
//     }

//     const eventId = `join-${session_id}-${user_id}-${client.id}`;
    
//     // Kiểm tra event đã được xử lý chưa
//     if (this.processingEvents.has(eventId)) {
//       this.logger.log(`🔄 Event already processing: ${eventId}`);
//       return;
//     }
    
//     this.processingEvents.add(eventId);
    
//     try {
//       this.logger.log(`🚪 Player attempting to join: wallet ${wallet_address}, user_id ${user_id}, room ${room_id}, session ${session_id}`);

//       // Kiểm tra user có quyền join room không và lấy join_id
//       const validation = await this.validateUserCanJoin(wallet_address, session_id, user_id);
//       let join_id = null;
//       let isParticipant = false;

//       if (validation.canJoin && validation.join_id) {
//         join_id = validation.join_id;
//         isParticipant = true;
//         this.logger.log(`✅ User ${user_id} is participant in session ${session_id}`);
//       } else {
//         this.logger.log(`👁️ User ${user_id} joining as watcher for session ${session_id} in room ${room_id}`);
//       }

//       // Load game state từ database
//       this.logger.log(`📂 Loading game state from database for session ${session_id}`);
//       let gameState = await this.rpsService.loadGameState(session_id);
//       if (!gameState) {
//         // Tạo game state mới nếu chưa có
//         this.logger.log(`🆕 Creating new game state for session ${session_id}`);
//         gameState = this.initializeGameState(session_id);
//         // Lưu vào database
//         await this.rpsService.saveGameState(session_id, gameState);
//       } else {
//         this.logger.log(`✅ Loaded existing game state from database: status ${gameState.status}, turn ${gameState.current_turn}, players ${gameState.players.length}`);
//       }

//       // Kiểm tra game đã kết thúc chưa
//       if (gameState.status === 'ended') {
//         this.logger.warn(`❌ Join failed: Game already ended for session ${session_id}`);
//         client.emit('error', { message: 'Game has already ended' });
//         return;
//       }

//       // Thêm socket vào phòng
//       client.join(`rps-room-${session_id}`);
//       this.logger.log(`🏠 Player joined room: rps-room-${session_id}`);
      
//       // Lưu thông tin người chơi/watcher với wallet_address và user_id
//       this.playerSockets.set(client.id, { session_id, join_id: join_id || 0, user_id, wallet_address });
      
//       // Cho phép cùng wallet có nhiều socket đồng thời
//       if (!this.walletSockets.has(wallet_address)) {
//         this.walletSockets.set(wallet_address, new Set());
//       }
      
//       // Thêm socket mới vào set
//       this.walletSockets.get(wallet_address)!.add(client.id);
//       this.logger.log(`👤 Player registered: wallet ${wallet_address} -> socket ${client.id}, join_id ${join_id} (total sockets: ${this.walletSockets.get(wallet_address)!.size})`);

//       // Thêm vào game room
//       if (!this.gameRooms.has(session_id)) {
//         this.gameRooms.set(session_id, new Set());
//         this.logger.log(`🆕 Created new game room for session ${session_id}`);
//       }
//       this.gameRooms.get(session_id).add(client.id);
//       this.logger.log(`📊 Room ${session_id} now has ${this.gameRooms.get(session_id).size} players`);

//       // Cập nhật game state (chỉ cho participants)
//       if (isParticipant && join_id) {
//         const existingPlayer = gameState.players.find(p => p.join_id === join_id);
        
//         if (!existingPlayer) {
//           // Lấy username từ database
//           const sessionPlayers = await this.rpsService.getSessionPlayers(session_id);
//           const playerData = sessionPlayers.find(p => p.id === join_id);
//           const username = playerData?.user_id?.username || 'Unknown';
          
//           gameState.players.push({
//             join_id,
//             wallet_address: wallet_address,
//             username: username,
//             socket_id: client.id,
//             status: 'active',
//             wins: 0,
//             losses: 0,
//             draws: 0,
//             points: 0,
//             is_locked: false,
//           });
//           this.logger.log(`➕ Added new player to game state: join_id ${join_id}, wallet ${wallet_address}, username ${username}`);
//         } else {
//           // Cập nhật thông tin player hiện có, bao gồm username
//           const sessionPlayers = await this.rpsService.getSessionPlayers(session_id);
//           const playerData = sessionPlayers.find(p => p.id === join_id);
//           const username = playerData?.user_id?.username || 'Unknown';
          
//           existingPlayer.socket_id = client.id;
//           existingPlayer.wallet_address = wallet_address;
//           existingPlayer.username = username;
//           existingPlayer.status = 'active';
//           this.logger.log(`🔄 Updated existing player: join_id ${join_id}, wallet ${wallet_address}, username ${username}, socket ${client.id}`);
//           // Hủy pending leave nếu có (reconnect trong grace period)
//           this.cancelPendingLeave(session_id, join_id);
//           // Thông báo reconnect
//           this.server.to(`rps-room-${session_id}`).emit('player-reconnected', {
//             player_id: join_id,
//           });
//         }
//       }

//       // Lưu game state vào database
//       await this.rpsService.saveGameState(session_id, gameState);
//       this.logger.log(`💾 Saved game state to database after join: session ${session_id}, status: ${gameState.status}, players: ${gameState.players.length}`);

//       // Lấy danh sách players đang online với username
//       const onlinePlayers = gameState.players
//         .filter(p => p.status === 'active' && this.isPlayerOnline(p.join_id))
//         .map(player => ({
//           join_id: player.join_id,
//           wallet_address: player.wallet_address,
//           username: player.username,
//           socket_id: player.socket_id,
//           status: player.status,
//           wins: player.wins,
//           losses: player.losses,
//           draws: player.draws,
//         }));

//       // Kiểm tra user có thể chơi được turn hiện tại không
//       // 1. Game phải đang chạy và có lượt chơi
//       // 2. User phải có trong danh sách players
//       // 3. User phải có status 'active'
//       // 4. User chưa bị loại trong các lượt trước
//       const userPlayer = gameState.players.find(p => p.join_id === join_id);
//       let can_play = true;
      
//       if (gameState.status === 'running' && gameState.current_turn > 0 && userPlayer && userPlayer.status === 'active') {
//         // Kiểm tra user có bị loại trong lượt trước không
//         if (gameState.current_turn > 1) {
//           // Lấy lượt chơi hiện tại từ database để kiểm tra
//           const currentTurn = await this.rpsService.getCurrentTurn(session_id);
//           if (currentTurn) {
//             // Kiểm tra kết quả của user trong lượt trước
//             const previousTurns = await this.gameRpsTurnsRepository.find({
//               where: {
//                 session_id: { id: session_id } as any,
//                 turn_number: LessThan(currentTurn.turn_number)
//               },
//               order: { turn_number: 'DESC' }
//             });
            
//             let isEliminated = false;
//             for (const turn of previousTurns) {
//               const userResult = await this.gameRpsResultsRepository.findOne({
//                 where: {
//                   join_id: { id: join_id } as any,
//                   turn_id: { id: turn.id } as any
//                 }
//               });
              
//               if (userResult && userResult.result === 'lose') {
//                 // Kiểm tra tình huống đặc biệt: Tất cả người chơi đều thua ở lượt này
//                 const allResultsInTurn = await this.gameRpsResultsRepository.find({
//                   where: { turn_id: { id: turn.id } as any }
//                 });
                
//                 const allPlayersLostInTurn = allResultsInTurn.length > 0 && allResultsInTurn.every(r => r.result === 'lose');
                
//                 if (allPlayersLostInTurn) {
//                   // Tất cả thua = user vẫn có thể chơi
//                   break;
//                 } else {
//                   // User bị loại
//                   isEliminated = true;
//                   break;
//                 }
//               }
//             }
            
//             can_play = !isEliminated;
//           }
//         } else {
//           // Lượt đầu tiên, user có thể chơi
//           can_play = true;
//         }
//       }

//       // Xác nhận tham gia phòng - chỉ trả về players đang online
//       client.emit('joined-game-room', {
//         room_id,
//         session_id,
//         players: onlinePlayers,
//         game_status: gameState.status,
//         current_turn: gameState.current_turn,
//         can_play: isParticipant ? can_play : false,  // Watchers không thể chơi
//         is_participant: isParticipant,               // Đánh dấu là participant hay watcher
//       });

//       // Emit thông tin quyền chơi cho người chơi mới join (chỉ cho participants)
//       if (isParticipant) {
//         client.emit('player-turn-permission', {
//           session_id,
//           current_turn: gameState.current_turn,
//           can_play,
//           message: can_play ? 'You can play the current turn' : 'You cannot play the current turn',
//           reason: can_play ? 'active_player' : (gameState.status !== 'running' ? 'game_not_running' : 'eliminated_or_inactive')
//         });
//       } else {
//         client.emit('player-turn-permission', {
//           session_id,
//           current_turn: gameState.current_turn,
//           can_play: false,
//           message: 'You are watching this game',
//           reason: 'watcher_mode'
//         });
//       }

//       // Thông báo cho người chơi khác - chỉ trả về players đang online
//       client.to(`rps-room-${session_id}`).emit('player-joined', {
//         room_id,
//         session_id,
//         player: { join_id: join_id || 0, wallet_address: wallet_address, socket_id: client.id, is_participant: isParticipant },
//         total_players: onlinePlayers.length,
//       });

//       this.logger.log(`👥 Online players: ${onlinePlayers.length}, Total players: ${gameState.players.length}`);

//       // Kiểm tra có đủ người chơi online để bắt đầu game không (cần ít nhất 2 người chơi)
//       if (onlinePlayers.length >= 2 && gameState.current_turn === 0) {
//         // Kiểm tra lock để tránh gọi startGame nhiều lần
//         if (!this.gameLocks.get(session_id)) {
//           this.gameLocks.set(session_id, true);
//           this.logger.log(`🎮 Starting game: ${onlinePlayers.length} online players ready, status: ${gameState.status}, turn: ${gameState.current_turn}`);
//           // Gọi startGame bất đồng bộ để tránh block
//           setImmediate(() => this.startGame(session_id));
//         } else {
//           this.logger.log(`🔒 Game start already in progress for session ${session_id}, skipping`);
//         }
//       } else if (gameState.status === 'running' && gameState.current_turn > 0) {
//         // Game đã bắt đầu, gửi thông tin game hiện tại cho player mới join
//         this.logger.log(`🎮 Game already running: turn ${gameState.current_turn}, sending current game info to player ${join_id}`);
//         await this.sendCurrentGameInfo(session_id, client, gameState);
//       } else {
//         this.logger.log(`⏳ Waiting for more online players: ${onlinePlayers.length}/2 players, status: ${gameState.status}, turn: ${gameState.current_turn}`);
//       }

//       this.logger.log(`✅ Join successful: Wallet ${wallet_address} (${isParticipant ? `Player ${join_id}` : 'Watcher'}) joined room ${session_id}`);
//     } catch (error) {
//       this.logger.error(`🚨 Error joining game room: ${error.message}`, error.stack);
//       client.emit('error', { message: 'Failed to join game room' });
//     } finally {
//       // Xóa event khỏi processing set
//       this.processingEvents.delete(eventId);
//     }
//   }

//   @SubscribeMessage('player-choice')
//   async handlePlayerChoice(
//     @MessageBody() data: PlayerChoiceDto,
//     @ConnectedSocket() client: Socket,
//   ) {
//     const { session_id, choice } = data;
    
//     // Lấy thông tin user từ socket data (đã xác thực khi connect)
//     const wallet_address = client.data.wallet_address;
//     const user_id = client.data.user_id;
    
//     if (!wallet_address || !user_id) {
//       this.logger.warn(`❌ Choice failed: No wallet address or user_id for socket ${client.id}`);
//       client.emit('error', { message: 'Authentication required. Please login first.' });
//       return;
//     }

//     // Tìm join_id từ user_id
//     const sessionPlayers = await this.rpsService.getSessionPlayers(session_id);
//     const player = sessionPlayers.find(p => p.user_id?.id === user_id);
//     if (!player) {
//       this.logger.warn(`❌ Choice failed: User ${user_id} not found in session ${session_id}`);
//       client.emit('error', { message: 'You are not authorized to perform this action' });
//       return;
//     }

//     const join_id = player.id;
//     const eventId = `choice-${session_id}-${join_id}-${client.id}`;
    
//     // Kiểm tra event đã được xử lý chưa
//     if (this.processingEvents.has(eventId)) {
//       this.logger.log(`🔄 Event already processing: ${eventId}`);
//       return;
//     }
    
//     this.processingEvents.add(eventId);
    
//     try {
//       this.logger.log(`🎯 Player choice received: wallet ${wallet_address}, user_id ${user_id}, session ${session_id}, join_id ${join_id}, choice: ${choice}`);

//       // Kiểm tra user có quyền thực hiện action này không
//       const playerInfo = this.playerSockets.get(client.id);
//       if (!playerInfo || playerInfo.join_id !== join_id) {
//         this.logger.warn(`❌ Choice failed: Unauthorized action for wallet ${wallet_address}, join_id ${join_id}`);
//         client.emit('error', { message: 'You are not authorized to perform this action' });
//         return;
//       }

//       const gameState = await this.rpsService.loadGameState(session_id);
//       if (!gameState || gameState.status !== 'running') {
//         this.logger.warn(`❌ Choice failed: Game not in running state for session ${session_id}, status: ${gameState?.status}`);
//         client.emit('error', { message: 'Game is not in running state' });
//         return;
//       }

//       // Kiểm tra người chơi có trong phòng không
//       const player = gameState.players.find(p => p.join_id === join_id);
//       if (!player || player.status !== 'active') {
//         this.logger.warn(`❌ Choice failed: Player not found or not active for join_id ${join_id}`);
//         client.emit('error', { message: 'Player not found or not active' });
//         return;
//       }

//       // Kiểm tra người chơi có bị lock không
//       if (player.is_locked) {
//         this.logger.warn(`❌ Choice failed: Player ${join_id} is locked and cannot make choices`);
//         client.emit('error', { message: 'You are locked and cannot make choices' });
//         return;
//       }

//       // Lấy lượt chơi hiện tại từ service
//       const currentTurn = await this.rpsService.getCurrentTurn(session_id);
//       if (!currentTurn) {
//         this.logger.warn(`❌ Choice failed: No active turn found for session ${session_id}`);
//         client.emit('error', { message: 'No active turn found' });
//         return;
//       }

//       // Kiểm tra player có bị loại trong bất kỳ lượt nào trước đó không
//       if (currentTurn.turn_number > 1) {
//         // Lấy tất cả các lượt trước đó (turn_number < currentTurn.turn_number)
//         const previousTurns = await this.gameRpsTurnsRepository.find({
//           where: {
//             session_id: { id: session_id } as any,
//             turn_number: LessThan(currentTurn.turn_number)
//           },
//           order: { turn_number: 'DESC' }
//         });
        
//         if (previousTurns.length > 0) {
//           // Kiểm tra kết quả của player trong tất cả các lượt trước
//           for (const turn of previousTurns) {
//             const playerResult = await this.gameRpsResultsRepository.findOne({
//               where: {
//                 join_id: { id: join_id } as any,
//                 turn_id: { id: turn.id } as any
//               }
//             });
            
//             if (playerResult && playerResult.result === 'lose') {
//               // Kiểm tra tình huống đặc biệt: Tất cả người chơi đều thua ở lượt này
//               const allResultsInTurn = await this.gameRpsResultsRepository.find({
//                 where: { turn_id: { id: turn.id } as any }
//               });
              
//               const allPlayersLostInTurn = allResultsInTurn.length > 0 && allResultsInTurn.every(r => r.result === 'lose');
              
//               if (allPlayersLostInTurn) {
//                 this.logger.log(`🔄 Special situation: All players lost in turn ${turn.turn_number} - allowing player ${join_id} to continue`);
                
//                 // Cập nhật status trong game state về active
//                 const playerInGameState = gameState.players.find(p => p.join_id === join_id);
//                 if (playerInGameState) {
//                   playerInGameState.status = 'active';
//                   this.logger.log(`🔄 Reset player ${join_id} to active due to all players lost in turn ${turn.turn_number}`);
//                 }
                
//                 // Lưu game state đã reset
//                 await this.rpsService.saveGameState(session_id, gameState);
                
//                 // Cho phép player tiếp tục chọn
//                 break;
//               } else {
//                 this.logger.warn(`❌ Choice failed: Player ${join_id} is eliminated from turn ${turn.turn_number}`);
                
//                 // Cập nhật status trong game state để không xuất hiện trong results
//                 const playerInGameState = gameState.players.find(p => p.join_id === join_id);
//                 if (playerInGameState) {
//                   playerInGameState.status = 'eliminated';
//                   this.logger.log(`🔄 Updated player ${join_id} status to 'eliminated' in game state`);
//                 }
                
//                 client.emit('error', { message: 'You have been eliminated from this game' });
//                 return;
//               }
//             }
//           }
//         }
//       }

//       // Lưu lựa chọn của người chơi vào database
//       await this.rpsService.savePlayerChoice(session_id, join_id, currentTurn.id, choice);
//       this.logger.log(`💾 Saved player choice to database: session ${session_id}, player ${join_id}, turn ${currentTurn.id}, choice: ${choice}`);

//       // Cập nhật game state từ database
//       const updatedGameState = await this.rpsService.loadGameState(session_id);
//       const previousChoice = updatedGameState.player_choices.get(join_id);
      
//       if (previousChoice) {
//         this.logger.log(`🔄 Player ${join_id} changed choice from ${previousChoice} to ${choice}`);
//       } else {
//         this.logger.log(`💾 Player ${join_id} chose: ${choice}`);
//       }

//       // Cập nhật cho tất cả người chơi trong phòng
//       const timeRemaining = Math.max(0, this.TURN_TIME_LIMIT - Math.floor((Date.now() - gameState.turn_start_time.getTime()) / 1000));
      
//       this.server.to(`rps-room-${session_id}`).emit('player-choice-update', {
//         session_id,
//         player_id: join_id,
//         choice,
//         time_remaining: timeRemaining,
//         can_change: true, // Có thể thay đổi lựa chọn
//         message: previousChoice ? 'Choice updated' : 'Choice made'
//       });

//       // Log trạng thái lựa chọn (không kết thúc lượt sớm)
//       const activePlayers = gameState.players.filter(p => p.status === 'active');
//       this.logger.log(`📊 Choice status: ${gameState.player_choices.size}/${activePlayers.length} players have chosen`);
//       this.logger.log(`⏰ Waiting for timer to expire (${timeRemaining}s remaining)`);

//       this.logger.log(`✅ Choice processed: Wallet ${playerInfo.wallet_address} (Player ${join_id}) chose ${choice} in room ${session_id}`);
//     } catch (error) {
//       this.logger.error(`🚨 Error handling player choice: ${error.message}`, error.stack);
//       client.emit('error', { message: 'Failed to process player choice' });
//     } finally {
//       // Xóa event khỏi processing set
//       this.processingEvents.delete(eventId);
//     }
//   }

//   // Bắt đầu game ngay lập tức
//   private async startGame(session_id: number) {
//     const startGameEventId = `startGame-${session_id}`;
    
//     // Kiểm tra event đã được xử lý chưa
//     if (this.processingEvents.has(startGameEventId)) {
//       this.logger.log(`🔄 StartGame already processing: ${startGameEventId}`);
//       return;
//     }
    
//     this.processingEvents.add(startGameEventId);
    
//     try {
//       // Load game state từ database
//       const gameState = await this.rpsService.loadGameState(session_id);
//       if (!gameState) {
//         this.logger.warn(`❌ No game state found for session ${session_id}`);
//         return;
//       }

//       this.logger.log(`🎮 Starting game for session ${session_id} with ${gameState.players.length} players`);
      
//       // Game state được lưu trong database
//       this.logger.log(`💾 Game state updated in database for session ${session_id}`);
      
//       // Lấy danh sách players đang online với username
//       const onlinePlayers = gameState.players
//         .filter(p => p.status === 'active' && this.isPlayerOnline(p.join_id))
//         .map(player => ({
//           join_id: player.join_id,
//           wallet_address: player.wallet_address,
//           username: player.username,
//           socket_id: player.socket_id,
//           status: player.status,
//           wins: player.wins,
//           losses: player.losses,
//           draws: player.draws,
//         }));
      
//       // Thông báo game bắt đầu - chỉ trả về players đang online
//       this.server.to(`rps-room-${session_id}`).emit('game-starting', {
//         players: onlinePlayers,
//       });
//       this.logger.log(`📢 Sent game-starting event to room ${session_id} with ${onlinePlayers.length} online players`);

//       // Bắt đầu lượt chơi đầu tiên ngay lập tức
//       this.logger.log(`🎯 Starting first turn immediately for session ${session_id}`);
//       // Gọi startTurn bất đồng bộ để tránh block
//       setImmediate(() => this.startTurn(session_id));
//     } finally {
//       // Unlock game sau khi hoàn thành
//       this.gameLocks.delete(session_id);
//       this.logger.log(`🔓 Game lock released for session ${session_id}`);
//       // Xóa event khỏi processing set
//       this.processingEvents.delete(startGameEventId);
//     }
//   }

//   // Bắt đầu lượt chơi mới
//   private async startTurn(session_id: number) {
//     const turnEventId = `startTurn-${session_id}`;
    
//     // Kiểm tra event đã được xử lý chưa
//     if (this.processingEvents.has(turnEventId)) {
//       this.logger.log(`🔄 StartTurn already processing: ${turnEventId}`);
//       return;
//     }
    
//     this.processingEvents.add(turnEventId);
    
//     try {
//       // Load game state từ database
//       const gameState = await this.rpsService.loadGameState(session_id);
//       if (!gameState) {
//         this.logger.warn(`❌ No game state found for session ${session_id}`);
//         return;
//       }

//       // Tạo turn mới - không cần kiểm tra turn đã tồn tại vì mỗi lần startTurn sẽ tạo turn mới
//       const nextTurnNumber = gameState.current_turn + 1;
//       this.logger.log(`🎯 Creating new turn ${nextTurnNumber} for session ${session_id}`);

//       // Kiểm tra game state có đang ở trạng thái running không
//       if (gameState.status !== 'running') {
//         this.logger.warn(`❌ Game not in running state for session ${session_id}, status: ${gameState.status}`);
//         return;
//       }

//       this.logger.log(`🎯 Starting turn ${gameState.current_turn + 1} for session ${session_id}`);
//       gameState.status = 'running';
//       gameState.current_turn += 1;
//       gameState.turn_start_time = new Date();
//       gameState.player_choices.clear();
//       gameState.bot_choice = 'wait';

//       // Bot chọn quân
//       gameState.bot_choice = this.getRandomBotChoice();
//       this.logger.log(`🤖 Bot chose: ${gameState.bot_choice} for turn ${gameState.current_turn} in session ${session_id}`);

//       // Kiểm tra người bị lock (không cộng điểm ngay lập tức)
//       const lockedPlayers = gameState.players.filter(p => p.is_locked);
//       if (lockedPlayers.length > 0) {
//         this.logger.log(`🔒 Found ${lockedPlayers.length} locked players - points will be added at end of turn`);
//       }

//       // Tính số lượng người chơi active (không bao gồm người bị lock)
//       const activePlayers = gameState.players.filter(p => p.status === 'active' && !p.is_locked);
//       const player_num = activePlayers.length;
//       this.logger.log(`👥 Active players count for turn ${gameState.current_turn}: ${player_num} (excluding ${lockedPlayers.length} locked players)`);

//       // Lưu turn vào database
//       const currentTurn = await this.rpsService.createTurn(session_id, gameState.current_turn, gameState.bot_choice, player_num);
//       this.logger.log(`💾 Turn ${gameState.current_turn} created in database for session ${session_id}, bot_choice: ${gameState.bot_choice}, player_num: ${player_num}`);


//       // Lưu game state vào database
//       await this.rpsService.saveGameState(session_id, gameState);
//       this.logger.log(`💾 Game state updated in database for session ${session_id}, status: ${gameState.status}, turn: ${gameState.current_turn}`);

//       // Gửi thông tin bot choice ngay lập tức (nếu được bật)
//       if (this.SEND_BOT_CHOICE_IMMEDIATELY) {
//       this.server.to(`rps-room-${session_id}`).emit('bot-choice', {
//         session_id,
//         turn_number: gameState.current_turn,
//         bot_choice: gameState.bot_choice,
//       });
//       this.logger.log(`📢 Sent bot-choice event: turn ${gameState.current_turn}, bot_choice: ${gameState.bot_choice}`);
//       } else {
//         this.logger.log(`🔇 Bot choice not sent immediately for turn ${gameState.current_turn} (SEND_BOT_CHOICE_IMMEDIATELY = false)`);
//       }

//       // Lấy danh sách players đang online với username
//       const onlinePlayers = gameState.players
//         .filter(p => p.status === 'active' && this.isPlayerOnline(p.join_id))
//         .map(player => ({
//           join_id: player.join_id,
//           wallet_address: player.wallet_address,
//           username: player.username,
//           socket_id: player.socket_id,
//           status: player.status,
//           wins: player.wins,
//           losses: player.losses,
//           draws: player.draws,
//         }));
      
//       const turnStartData: any = {
//         session_id,
//         turn_number: gameState.current_turn,
//         time_limit: this.TURN_TIME_LIMIT,
//         players: onlinePlayers, // Chỉ trả về players đang online
//       };
      
//       if (this.SEND_BOT_CHOICE_IMMEDIATELY) {
//         turnStartData.bot_choice = gameState.bot_choice;
//       }
      
//       this.server.to(`rps-room-${session_id}`).emit('turn-start', turnStartData);
//       this.logger.log(`📢 Sent turn-start event: turn ${gameState.current_turn}, time_limit: ${this.TURN_TIME_LIMIT}s, online_players: ${onlinePlayers.length}`);

//       // Emit thông tin quyền chơi cho tất cả players khi bắt đầu lượt mới
//       for (const player of onlinePlayers) {
//         // Tính toán can_play cho từng player
//         let can_play_turn = false;
//         if (gameState.status === 'running' && gameState.current_turn > 0) {
//           const userPlayer = gameState.players.find(p => p.join_id === player.join_id);
//           if (userPlayer && userPlayer.status === 'active' && !userPlayer.is_locked) {
//             if (gameState.current_turn > 1) {
//               // Kiểm tra user có bị loại trong lượt trước không
//               const currentTurn = await this.rpsService.getCurrentTurn(session_id);
//               if (currentTurn) {
//                 const previousTurns = await this.gameRpsTurnsRepository.find({
//                   where: {
//                     session_id: { id: session_id } as any,
//                     turn_number: LessThan(currentTurn.turn_number)
//                   },
//                   order: { turn_number: 'DESC' }
//                 });
                
//                 let isEliminated = false;
//                 for (const turn of previousTurns) {
//                   const userResult = await this.gameRpsResultsRepository.findOne({
//                     where: {
//                       join_id: { id: player.join_id } as any,
//                       turn_id: { id: turn.id } as any
//                     }
//                   });
                  
//                   if (userResult && userResult.result === 'lose') {
//                     const allResultsInTurn = await this.gameRpsResultsRepository.find({
//                       where: { turn_id: { id: turn.id } as any }
//                     });
                    
//                     const allPlayersLostInTurn = allResultsInTurn.length > 0 && allResultsInTurn.every(r => r.result === 'lose');
                    
//                     if (allPlayersLostInTurn) {
//                       break; // Tất cả thua = user vẫn có thể chơi
//                     } else {
//                       isEliminated = true;
//                       break;
//                     }
//                   }
//                 }
                
//                 can_play_turn = !isEliminated;
//               }
//             } else {
//               can_play_turn = true; // Lượt đầu tiên
//             }
//           }
//         }

//         // Gửi cho tất cả socket của player này
//         const roomSockets = this.gameRooms.get(session_id) || new Set();
//         const playerSocketIds = Array.from(roomSockets).filter(socketId => {
//           const playerInfo = this.playerSockets.get(socketId);
//           return playerInfo && playerInfo.join_id === player.join_id;
//         });
        
//         for (const socketId of playerSocketIds) {
//           this.server.to(socketId).emit('player-turn-permission', {
//             session_id,
//             current_turn: gameState.current_turn,
//             can_play: can_play_turn,
//             message: can_play_turn ? 'You can play the current turn' : 'You cannot play the current turn',
//             reason: can_play_turn ? 'active_player' : (gameState.status !== 'running' ? 'game_not_running' : 'eliminated_or_inactive'),
//             turn_update: true // Đánh dấu đây là cập nhật từ lượt mới
//           });
//         }
//       }
//       this.logger.log(`📢 Sent player-turn-permission to all players for turn ${gameState.current_turn}`);

//       // Gửi bảng xếp hạng khi bắt đầu lượt mới
//       await this.sendTurnRankingsOnTurnStart(session_id, gameState);

//       // Timer với thời gian cấu hình
//       const timer = setTimeout(() => {
//         this.logger.log(`⏰ Turn timer expired for session ${session_id}, turn ${gameState.current_turn}`);
//         this.endTurn(session_id);
//       }, this.TURN_TIME_LIMIT * 1000);
      
//       this.turnTimers.set(session_id, timer);
//       this.logger.log(`⏱️ Set ${this.TURN_TIME_LIMIT}-second timer for turn ${gameState.current_turn} in session ${session_id}`);
//     } finally {
//       // Xóa event khỏi processing set
//       this.processingEvents.delete(turnEventId);
//     }
//   }

//   // Kết thúc lượt chơi
//   private async endTurn(session_id: number) {
//     const endTurnEventId = `endTurn-${session_id}`;
    
//     // Kiểm tra event đã được xử lý chưa
//     if (this.processingEvents.has(endTurnEventId)) {
//       this.logger.log(`🔄 EndTurn already processing: ${endTurnEventId}`);
//       return;
//     }
    
//     this.processingEvents.add(endTurnEventId);
    
//     try {
//       // Load game state từ database
//       const gameState = await this.rpsService.loadGameState(session_id);
//       if (!gameState) return;

//     this.logger.log(`🏁 Ending turn ${gameState.current_turn} for session ${session_id}`);

//     // Clear timer
//     const timer = this.turnTimers.get(session_id);
//     if (timer) {
//       clearTimeout(timer);
//       this.turnTimers.delete(session_id);
//       this.logger.log(`⏱️ Cleared timer for session ${session_id}`);
//     }

//     // Lấy lượt chơi hiện tại từ database
//     const currentTurn = await this.rpsService.getCurrentTurn(session_id);
//     if (!currentTurn) {
//       this.logger.warn(`❌ No current turn found for session ${session_id}`);
//       return;
//     }
//     this.logger.log(`📊 Processing turn ${currentTurn.id} from database for session ${session_id}`);

//     // Lọc ra những người chơi thực sự active (chưa bị loại từ lượt trước, KHÔNG bao gồm người bị lock)
//     const activePlayers = [];
//     for (const player of gameState.players) {
//       if (player.status === 'active' && !player.is_locked) {
//         // Kiểm tra xem player có bị loại trong lượt trước không
//         if (currentTurn.turn_number > 1) {
//           const previousTurns = await this.gameRpsTurnsRepository.find({
//             where: {
//               session_id: { id: session_id } as any,
//               turn_number: LessThan(currentTurn.turn_number)
//             },
//             order: { turn_number: 'DESC' }
//           });
          
//           let isEliminated = false;
//           for (const turn of previousTurns) {
//             const playerResult = await this.gameRpsResultsRepository.findOne({
//               where: {
//                 join_id: { id: player.join_id } as any,
//                 turn_id: { id: turn.id } as any
//               }
//             });
            
//             if (playerResult && playerResult.result === 'lose') {
//               // Kiểm tra tình huống đặc biệt: Tất cả người chơi đều thua ở lượt này
//               const allResultsInTurn = await this.gameRpsResultsRepository.find({
//                 where: { turn_id: { id: turn.id } as any }
//               });
              
//               const allPlayersLostInTurn = allResultsInTurn.length > 0 && allResultsInTurn.every(r => r.result === 'lose');
              
//               if (allPlayersLostInTurn) {
//                 this.logger.log(`🔄 Special situation in endTurn: All players lost in turn ${turn.turn_number} - keeping player ${player.join_id} active`);
//                 // Không đánh dấu là eliminated, cho phép tiếp tục
//                 break;
//               } else {
//                 isEliminated = true;
//                 player.status = 'eliminated'; // Cập nhật status
//                 this.logger.log(`🔄 Player ${player.join_id} was eliminated in turn ${turn.turn_number}, marking as eliminated`);
//                 break;
//               }
//             }
//           }
          
//           if (!isEliminated) {
//             activePlayers.push(player);
//           }
//         } else {
//           // Lượt đầu tiên, tất cả đều active
//           activePlayers.push(player);
//         }
//       }
//     }
    
//     // Kiểm tra và xử lý players đã disconnect trong turn hiện tại
//     for (const player of activePlayers) {
//       if (!this.isPlayerOnline(player.join_id)) {
//         // Player đã disconnect trong turn hiện tại = không chọn = thua
//         this.logger.log(`🔌 Player ${player.join_id} disconnected during turn ${currentTurn.turn_number} - treating as no choice`);
//         player.status = 'eliminated';
//         player.losses += 1;
        
//         // Lưu kết quả "disconnected = lose" vào database
//         await this.rpsService.calculateAndSaveResult(session_id, player.join_id, currentTurn.id, 'wait', gameState.bot_choice);
//         this.logger.log(`💾 Player disconnect result saved to database: session ${session_id}, player ${player.join_id}, choice: wait, bot: ${gameState.bot_choice}, result: lose`);
//       }
//     }
    
//     const results = [];
//     this.logger.log(`📊 Processing results for ${activePlayers.length} truly active players (filtered from ${gameState.players.length} total)`);

//     // Tính kết quả cho từng người chơi
//     for (const player of activePlayers) {
//       const playerChoice = gameState.player_choices.get(player.join_id);
      
//       if (!playerChoice) {
//         // Người chơi không chọn = thua
//         player.status = 'eliminated';
//         player.losses += 1;
        
//         // Lưu kết quả "no choice = lose" vào database
//         await this.rpsService.calculateAndSaveResult(session_id, player.join_id, currentTurn.id, 'wait', gameState.bot_choice);
//         this.logger.log(`💾 Player no-choice result saved to database: session ${session_id}, player ${player.join_id}, choice: wait, bot: ${gameState.bot_choice}, result: lose`);
        
//         // Thêm vào results vì vẫn là người chơi trong lượt hiện tại
//         results.push({
//           player_id: player.join_id,
//           choice: 'wait',
//           result: 'lose',
//           status: 'eliminated',
//         });
//         this.logger.log(`❌ Player ${player.join_id} eliminated (no choice) - included in results`);
//       } else {
//         // Tính kết quả
//         const result = this.calculateRpsResult(playerChoice, gameState.bot_choice);
        
//         if (result === 'win') {
//           player.wins += 1;      // Số lượng lần thắng +1
//           player.points += 2;    // Điểm +2
//         } else if (result === 'lose') {
//           player.status = 'eliminated';
//           player.losses += 1;    // Số lượng lần thua +1
//           // Không cộng điểm cho thua
//         } else {
//           player.draws += 1;     // Số lượng lần hòa +1
//           player.points += 1;    // Điểm +1
//         }

//         // Thêm vào results tất cả người chơi trong lượt hiện tại (kể cả thua)
//         results.push({
//           player_id: player.join_id,
//           choice: playerChoice,
//           result,
//           status: player.status,
//         });

//         this.logger.log(`🎯 Player ${player.join_id}: ${playerChoice} vs ${gameState.bot_choice} = ${result}`);

//         // Lưu kết quả vào database với tính toán chính xác
//         await this.rpsService.calculateAndSaveResult(session_id, player.join_id, currentTurn.id, playerChoice, gameState.bot_choice);
//         this.logger.log(`💾 Player result saved to database: session ${session_id}, player ${player.join_id}, choice: ${playerChoice}, bot: ${gameState.bot_choice}, result: ${result}`);
//       }
//     }

//     // Kiểm tra và lock người thắng duy nhất
//     const winners = results.filter(r => r.result === 'win');
//     const draws = results.filter(r => r.result === 'draw');
    
//     let newlyLockedPlayer = null;
//     if (winners.length === 1 && draws.length >= 1) {
//       // Có đúng 1 người thắng và có ít nhất 1 người hòa
//       const winnerResult = winners[0];
//       const winnerPlayer = gameState.players.find(p => p.join_id === winnerResult.player_id);
      
//       if (winnerPlayer) {
//         winnerPlayer.is_locked = true;
//         newlyLockedPlayer = winnerPlayer; // Lưu lại người mới bị lock
//         // Lưu vào database
//         await this.rpsService.updatePlayerLockStatus(winnerPlayer.join_id, true);
//         this.logger.log(`🔒 Player ${winnerPlayer.join_id} won and is now locked - will auto-grant 2 points per turn (${draws.length} players drew)`);
//       }
//     }

//     // Cộng điểm lượt hiện tại cho người đã bị lock từ trước (KHÔNG cộng cho người mới bị lock)
//     const lockedPlayers = gameState.players.filter(p => p.is_locked);
//     for (const lockedPlayer of lockedPlayers) {
//       // Chỉ cộng điểm nếu KHÔNG phải người mới bị lock trong lượt này
//       if (lockedPlayer.join_id !== newlyLockedPlayer?.join_id) {
//         lockedPlayer.points += 2; // Cộng điểm lượt hiện tại
//         lockedPlayer.wins += 1;   // Cộng 1 win lượt hiện tại
        
//         // Lưu kết quả auto-win vào database
//         await this.rpsService.calculateAndSaveResult(session_id, lockedPlayer.join_id, currentTurn.id, 'wait', gameState.bot_choice, true);
//         this.logger.log(`🔒 Auto-granted 2 points for current turn to locked player ${lockedPlayer.join_id} (total: ${lockedPlayer.points} points)`);
//       } else {
//         this.logger.log(`🔒 Newly locked player ${lockedPlayer.join_id} will receive points starting from next turn`);
//       }
//     }

//     // Lưu game state vào database
//     await this.rpsService.saveGameState(session_id, gameState);
//     this.logger.log(`💾 Final game state updated in database for session ${session_id}, status: ${gameState.status}, turn: ${gameState.current_turn}`);

//     // Lấy thông tin thời gian tham gia từ database
//     const sessionPlayers = await this.rpsService.getSessionPlayers(session_id);
//     const playerJoinTimes = new Map<number, Date>();
//     sessionPlayers.forEach(player => {
//       playerJoinTimes.set(player.id, player.time_join);
//     });

//     // Tạo bảng xếp hạng với điểm số mới và thông tin real-time
//     const sortedPlayers = gameState.players.sort((a, b) => {
//       // Sắp xếp theo điểm số (points), sau đó theo thời gian tham gia
//       if (a.points !== b.points) return b.points - a.points; // Điểm cao hơn xếp trước
      
//       // Cùng điểm thì tham gia sớm hơn xếp trước
//       const joinTimeA = playerJoinTimes.get(a.join_id);
//       const joinTimeB = playerJoinTimes.get(b.join_id);
//       if (joinTimeA && joinTimeB) {
//         return joinTimeA.getTime() - joinTimeB.getTime();
//       }
//       return a.join_id - b.join_id; // Fallback nếu không có thời gian
//     });

//     // Tạo rankings với thông tin real-time
//     const currentRankings = [];
//     for (let i = 0; i < sortedPlayers.length; i++) {
//       const player = sortedPlayers[i];
      
//       // Kiểm tra player có bị thua ở lượt trước không và lấy dữ liệu kết quả thua
//       let isEliminatedFromPreviousTurn = false;
//       let eliminatedChoice = 'wait';
//       let eliminatedResult = 'waiting';
//       let eliminatedBotChoice = 'wait';
      
//       if (currentTurn.turn_number > 1) {
//         // Lấy tất cả các lượt trước đó
//         const previousTurns = await this.gameRpsTurnsRepository.find({
//           where: {
//             session_id: { id: session_id } as any,
//             turn_number: LessThan(currentTurn.turn_number)
//           },
//           order: { turn_number: 'DESC' }
//         });
        
//         for (const turn of previousTurns) {
//           const playerResult = await this.gameRpsResultsRepository.findOne({
//             where: {
//               join_id: { id: player.join_id } as any,
//               turn_id: { id: turn.id } as any
//             }
//           });
          
//           if (playerResult && playerResult.result === 'lose') {
//             // Kiểm tra tình huống đặc biệt: Tất cả người chơi đều thua ở lượt này
//             const allResultsInTurn = await this.gameRpsResultsRepository.find({
//               where: { turn_id: { id: turn.id } as any }
//             });
            
//             const allPlayersLostInTurn = allResultsInTurn.length > 0 && allResultsInTurn.every(r => r.result === 'lose');
            
//             if (!allPlayersLostInTurn) {
//               // Player bị thua ở lượt trước và không phải tình huống đặc biệt
//               isEliminatedFromPreviousTurn = true;
              
//               // Lấy dữ liệu kết quả thua cuối cùng
//               eliminatedChoice = playerResult.select || 'wait';
//               eliminatedResult = 'lose';
//               eliminatedBotChoice = turn.bot_select || 'wait';
              
//               this.logger.log(`📊 Player ${player.join_id} eliminated in turn ${turn.turn_number}: choice=${eliminatedChoice}, result=${eliminatedResult}, bot=${eliminatedBotChoice}`);
//               break;
//             }
//           }
//         }
//       }
      
//       // Xác định dữ liệu hiển thị
//       let displayChoice, displayResult, displayBotChoice;
      
//       if (isEliminatedFromPreviousTurn) {
//         // Người thua: hiển thị dữ liệu kết quả thua cuối cùng
//         displayChoice = eliminatedChoice;
//         displayResult = eliminatedResult;
//         displayBotChoice = eliminatedBotChoice;
//       } else {
//         // Người chơi bình thường: hiển thị lựa chọn và kết quả lượt hiện tại
//         displayChoice = gameState.player_choices.get(player.join_id) || 'wait';
//         displayResult = 'waiting';
//         if (displayChoice !== 'wait') {
//           displayResult = this.calculateRpsResult(displayChoice, gameState.bot_choice);
//         }
//         displayBotChoice = gameState.bot_choice;
        
//         // Người bị lock: hiển thị kết quả auto-win
//         if (player.is_locked) {
//           displayResult = 'win';
//           this.logger.log(`🔒 Turn rankings - Player ${player.join_id} (locked): showing auto-win result`);
//         }
//       }
      
//       // Tính toán stats chính xác cho người bị lock
//       let actualWins = player.wins;
//       let actualLosses = player.losses;
//       let actualDraws = player.draws;
      
//       if (player.is_locked) {
//         // Người bị lock: gameState đã được cập nhật với auto-wins trong endTurn
//         // Không cần cộng thêm auto-wins nữa, chỉ sử dụng giá trị từ gameState
//         this.logger.log(`🔒 Turn rankings - Player ${player.join_id} (locked): wins=${actualWins}, losses=${actualLosses} (from DB), draws=${actualDraws}`);
//       }
      
//       currentRankings.push({
//         rank: i + 1,
//         player_id: player.join_id,
//         username: player.username,
//         wallet_address: player.wallet_address,
//         total_score: player.points, // Tổng điểm
//         wins: actualWins, // Số lượng lần thắng (đã tính auto-wins cho người bị lock)
//         draws: actualDraws, // Số lượng lần hòa
//         losses: actualLosses, // Số lượng lần thua (0 cho người bị lock)
//         points: player.points, // Điểm số (thắng +2, hòa +1, thua +0)
//         status: player.status,
//         join_time: playerJoinTimes.get(player.join_id) || new Date(), // Thời gian tham gia thực tế
//         // Thông tin hiển thị (khác nhau cho người thua và người chơi bình thường)
//         current_choice: displayChoice, // Lựa chọn (người thua: lựa chọn thua cuối, người chơi: lựa chọn lượt hiện tại)
//         current_result: displayResult, // Kết quả (người thua: 'lose', người chơi: kết quả lượt hiện tại)
//         current_bot_choice: displayBotChoice, // Bot choice (người thua: bot choice lượt thua, người chơi: bot choice lượt hiện tại)
//         is_eliminated_from_previous_turn: isEliminatedFromPreviousTurn, // Bị thua ở lượt trước
//         can_play_current_turn: !isEliminatedFromPreviousTurn && player.status === 'active' && !player.is_locked // Có thể chơi lượt hiện tại
//       });
//     }

//     // Emit bảng xếp hạng mới cho tất cả players
//     this.server.to(`rps-room-${session_id}`).emit('turn-rankings', {
//       session_id,
//       turn_number: gameState.current_turn,
//       rankings: currentRankings,
//       turn_results: results, // Kết quả của turn hiện tại
//       message: `Rankings updated after turn ${gameState.current_turn}`
//     });
//     this.logger.log(`📊 Sent turn-rankings event: turn ${gameState.current_turn}, ${currentRankings.length} players ranked`);

//     // Kiểm tra tình huống đặc biệt: Tất cả người chơi đều thua trong lượt hiện tại
//     const allPlayersLostCurrentTurn = results.every(r => r.result === 'lose');
    
//     if (allPlayersLostCurrentTurn) {
//       // Kiểm tra xem tất cả có phải đều không chọn không
//       const allPlayersDidNotChoose = results.every(r => r.choice === 'wait');
      
//       if (allPlayersDidNotChoose) {
//         // Tất cả không chọn = Kết thúc game
//         this.logger.log(`🏁 Special situation: All players did not choose in turn ${currentTurn.turn_number} - ending game`);
        
//         // Đánh dấu tất cả người chơi là eliminated
//         for (const player of gameState.players) {
//           if (player.status !== 'eliminated') {
//             player.status = 'eliminated';
//             this.logger.log(`🏁 Marked player ${player.join_id} as eliminated - all players did not choose`);
//           }
//         }
        
//         // Cập nhật lại status cho tất cả results (tất cả đều eliminated)
//         results.forEach(result => {
//           result.status = 'eliminated';
//         });
        
//         // Lưu game state
//         await this.rpsService.saveGameState(session_id, gameState);
        
//         // Kết thúc game ngay lập tức
//         this.logger.log(`🏁 Game ending due to all players did not choose - calling endGame immediately`);
//         setTimeout(() => {
//           this.logger.log(`⏰ ${this.GAME_END_DELAY}-second delay finished, ending game due to all players did not choose`);
//           this.endGame(session_id);
//         }, this.GAME_END_DELAY * 1000);
        
//         this.logger.log(`✅ Turn ${gameState.current_turn} completed for session ${session_id} - all players did not choose ending`);
//         return; // Kết thúc method sớm, không chạy logic tiếp theo
//       } else {
//         // Tất cả chọn và thua = Reset về active và tiếp tục
//         this.logger.log(`🔄 Special situation: All players chose and lost in turn ${currentTurn.turn_number} - allowing all to continue`);
        
//         // Reset tất cả người chơi về active (kể cả những người đã bị loại)
//         for (const player of gameState.players) {
//           if (player.status === 'eliminated') {
//             player.status = 'active';
//             this.logger.log(`🔄 Reset player ${player.join_id} to active after all chose and lost current turn`);
//           }
//         }
        
//         // Cập nhật lại status cho tất cả results
//         results.forEach(result => {
//           const player = gameState.players.find(p => p.join_id === result.player_id);
//           result.status = player ? player.status : 'eliminated';
//         });
        
//         // Lưu game state đã reset
//         await this.rpsService.saveGameState(session_id, gameState);
        
//         // Log số lượng người chơi sau khi reset
//         const resetPlayers = gameState.players.filter(p => p.status === 'active');
//         this.logger.log(`🔄 After reset: ${resetPlayers.length} players are now active`);
//       }
//     } else {
      
//       // Kiểm tra tình huống đặc biệt: Tất cả người chơi đều thua ở lượt trước (chỉ nếu không phải tình huống trên)
//       if (currentTurn.turn_number > 1) {
//         // Kiểm tra tình huống đặc biệt: Tất cả người chơi đều thua ở lượt trước
//         const previousTurn = await this.gameRpsTurnsRepository.findOne({
//           where: {
//             session_id: { id: session_id } as any,
//             turn_number: currentTurn.turn_number - 1
//           }
//         });
        
//         if (previousTurn) {
//           // Lấy tất cả kết quả của lượt trước
//           const previousResults = await this.gameRpsResultsRepository.find({
//             where: { turn_id: { id: previousTurn.id } as any }
//           });
          
//           // Kiểm tra xem tất cả người chơi có đều thua ở lượt trước không
//           const allPlayersLostPreviousTurn = previousResults.length > 0 && previousResults.every(r => r.result === 'lose');
          
//           // Kiểm tra lượt hiện tại có kết quả khác nhau không (không phải tất cả đều thua)
//           const currentTurnHasDifferentResults = results.some(r => r.result !== 'lose');
          
//           if (allPlayersLostPreviousTurn && !currentTurnHasDifferentResults) {
//             this.logger.log(`🔄 Special situation: All players lost in previous turn ${previousTurn.turn_number} - allowing all to continue`);
            
//             // Reset tất cả người chơi về active (kể cả những người đã bị loại)
//             for (const player of gameState.players) {
//               if (player.status === 'eliminated') {
//                 player.status = 'active';
//                 this.logger.log(`🔄 Reset player ${player.join_id} to active after all lost previous turn`);
//               }
//             }
            
//             // Cập nhật lại status cho tất cả results
//             results.forEach(result => {
//               const player = gameState.players.find(p => p.join_id === result.player_id);
//               result.status = player ? player.status : 'eliminated';
//             });
            
//             // Lưu game state đã reset
//             await this.rpsService.saveGameState(session_id, gameState);
            
//             // Log số lượng người chơi sau khi reset
//             const resetPlayers = gameState.players.filter(p => p.status === 'active');
//             this.logger.log(`🔄 After reset: ${resetPlayers.length} players are now active`);
//           }
//         }
//       }
//     }

//     // Thêm kết quả auto-win cho người bị lock vào results
//     const lockedPlayersForResults = gameState.players.filter(p => p.is_locked);
//     for (const lockedPlayer of lockedPlayersForResults) {
//       // Kiểm tra xem đã có kết quả cho người bị lock chưa
//       const existingResult = results.find(r => r.player_id === lockedPlayer.join_id);
//       if (!existingResult) {
//         // Thêm kết quả auto-win cho người bị lock
//         results.push({
//           player_id: lockedPlayer.join_id,
//           choice: 'wait',
//           result: 'win',
//           status: 'active',
//         });
//         this.logger.log(`🔒 Added auto-win result to results for locked player ${lockedPlayer.join_id}`);
//       }
//     }

//     // Gửi kết quả lượt chơi chung + riêng cho từng người chơi (bao gồm cả người bị loại và người bị lock)
//     const allPlayers = gameState.players.filter(p => p.status === 'active' || p.status === 'eliminated');
//     for (const player of allPlayers) {
//       const playerResult = results.find(r => r.player_id === player.join_id);
//       if (playerResult) {
//         // Tìm tất cả socket của player này trong room
//         const roomSockets = this.gameRooms.get(session_id) || new Set();
//         const playerSocketIds = Array.from(roomSockets).filter(socketId => {
//           const playerInfo = this.playerSockets.get(socketId);
//           return playerInfo && playerInfo.join_id === player.join_id;
//         });
        
//         // Gửi cho từng socket của player này
//         for (const socketId of playerSocketIds) {
//           this.server.to(socketId).emit('turn-result', {
//       session_id,
//       turn_number: gameState.current_turn,
//       bot_choice: gameState.bot_choice,
//             results, // Mảng chung cho tất cả (bao gồm auto-win cho người bị lock)
//             player_result: playerResult, // Kết quả riêng của player này
//             is_locked: player.is_locked, // Trạng thái bị lock
//             next_turn_in: this.TURN_BREAK_TIME,
//           });
//         }
//         this.logger.log(`📢 Sent turn-result to player ${player.join_id}: common results + personal result`);
//       }
//     }
//     this.logger.log(`📢 Sent turn-result events to ${allPlayers.length} players for turn ${gameState.current_turn}`);

//     // Kiểm tra game kết thúc (chỉ tính người chơi thực sự, không tính người bị lock)
//     const remainingActivePlayers = gameState.players.filter(p => p.status === 'active' && !p.is_locked);
//     this.logger.log(`👥 Remaining active players: ${remainingActivePlayers.length} (excluding ${gameState.players.filter(p => p.is_locked).length} locked players)`);
//     this.logger.log(`📊 Player statuses: ${gameState.players.map(p => `${p.join_id}:${p.status}${p.is_locked ? '(locked)' : ''}`).join(', ')}`);
    
//     // Kiểm tra điều kiện đặc biệt: 1 thắng, 1 hòa (chỉ tính người chơi còn active)
//     const activeResults = results.filter(r => r.status === 'active');
//     const winResults = activeResults.filter(r => r.result === 'win');
//     const drawResults = activeResults.filter(r => r.result === 'draw');
//     const isOneWinOneDraw = winResults.length === 1 && drawResults.length === 1 && activeResults.length === 2;
    
//     if (remainingActivePlayers.length <= 1 || isOneWinOneDraw) {
//       // Game kết thúc
//       if (isOneWinOneDraw) {
//         this.logger.log(`🏆 Game ending: 1 winner, 1 draw - special condition met`);
//       } else {
//         this.logger.log(`🏆 Game ending: only ${remainingActivePlayers.length} active players remaining`);
//       }
//       setTimeout(() => {
//         this.logger.log(`⏰ ${this.GAME_END_DELAY}-second delay finished, ending game for session ${session_id}`);
//         this.endGame(session_id);
//       }, this.GAME_END_DELAY * 1000);
//     } else {
//       // Bắt đầu lượt tiếp theo
//       this.logger.log(`🔄 Starting next turn: ${remainingActivePlayers.length} players still active`);
//       setTimeout(() => {
//         this.logger.log(`⏰ ${this.TURN_BREAK_TIME}-second delay finished, starting next turn for session ${session_id}`);
//         // Gọi startTurn bất đồng bộ để tránh block
//         setImmediate(() => this.startTurn(session_id));
//       }, this.TURN_BREAK_TIME * 1000);
//     }

//     this.logger.log(`✅ Turn ${gameState.current_turn} completed for session ${session_id}`);
//     } finally {
//       // Xóa event khỏi processing set
//       this.processingEvents.delete(endTurnEventId);
//     }
//   }

//   // Kết thúc game
//   private async endGame(session_id: number) {
//     // Load game state từ database
//     const gameState = await this.rpsService.loadGameState(session_id);
//     if (!gameState) return;

//     this.logger.log(`🏁 Ending game for session ${session_id}`);
//     gameState.status = 'ended';

//     // Cập nhật trạng thái game session trong database
//     await this.rpsService.updateGameSessionStatus(session_id, 'end');
//     this.logger.log(`💾 Game session status updated to 'end' in database for session ${session_id}`);

//     // Tìm người thắng (bao gồm cả người bị lock)
//     const allActivePlayers = gameState.players.filter(p => p.status === 'active');
//     let winner = null;

//     if (allActivePlayers.length === 1) {
//       winner = allActivePlayers[0];
//       this.logger.log(`🏆 Winner found: Player ${winner.join_id} (wallet: ${winner.wallet_address})`);
//     } else if (allActivePlayers.length > 1) {
//       // Xử lý đồng hạng - người có điểm cao nhất thắng, nếu bằng điểm thì tham gia sớm nhất thắng
//       winner = allActivePlayers.sort((a, b) => {
//         if (a.points !== b.points) return b.points - a.points; // Điểm cao hơn xếp trước
//         return a.join_id - b.join_id; // Cùng điểm thì tham gia sớm hơn thắng
//       })[0];
//       this.logger.log(`🏆 Tie-breaker winner: Player ${winner.join_id} (wallet: ${winner.wallet_address}) from ${allActivePlayers.length} active players`);
//     } else {
//       this.logger.warn(`⚠️ No active players found for session ${session_id}`);
//     }

//     // Lấy thông tin thời gian tham gia từ database cho bảng xếp hạng cuối game
//     const sessionPlayers = await this.rpsService.getSessionPlayers(session_id);
//     const playerJoinTimes = new Map<number, Date>();
//     sessionPlayers.forEach(player => {
//       playerJoinTimes.set(player.id, player.time_join);
//     });

//     // Tạo bảng xếp hạng cuối game với hệ thống điểm mới và kết quả cuối cùng
//     const sortedPlayersFinal = gameState.players.sort((a, b) => {
//       // Sắp xếp theo điểm số (points), sau đó theo thời gian tham gia
//       if (a.points !== b.points) return b.points - a.points; // Điểm cao hơn xếp trước
      
//       // Cùng điểm thì tham gia sớm hơn xếp trước
//       const joinTimeA = playerJoinTimes.get(a.join_id);
//       const joinTimeB = playerJoinTimes.get(b.join_id);
//       if (joinTimeA && joinTimeB) {
//         return joinTimeA.getTime() - joinTimeB.getTime();
//       }
//       return a.join_id - b.join_id; // Fallback nếu không có thời gian
//     });

//     // Tạo rankings cuối game với thông tin kết quả cuối cùng
//     const rankings = [];
//     for (let i = 0; i < sortedPlayersFinal.length; i++) {
//       const player = sortedPlayersFinal[i];
      
//       // Lấy kết quả cuối cùng của player trong lượt cuối
//       const finalChoice = gameState.player_choices.get(player.join_id) || 'wait';
//       let finalResult = 'waiting';
//       if (finalChoice !== 'wait') {
//         finalResult = this.calculateRpsResult(finalChoice, gameState.bot_choice);
//       }
      
//       // Kiểm tra player có bị thua ở lượt trước không (chỉ hiển thị kết quả lose)
//       let isEliminatedFromPreviousTurn = false;
//       if (gameState.current_turn > 1) {
//         // Lấy tất cả các lượt trước đó
//         const previousTurns = await this.gameRpsTurnsRepository.find({
//           where: {
//             session_id: { id: session_id } as any,
//             turn_number: LessThan(gameState.current_turn)
//           },
//           order: { turn_number: 'DESC' }
//         });
        
//         for (const turn of previousTurns) {
//           const playerResult = await this.gameRpsResultsRepository.findOne({
//             where: {
//               join_id: { id: player.join_id } as any,
//               turn_id: { id: turn.id } as any
//             }
//           });
          
//           if (playerResult && playerResult.result === 'lose') {
//             // Kiểm tra tình huống đặc biệt: Tất cả người chơi đều thua ở lượt này
//             const allResultsInTurn = await this.gameRpsResultsRepository.find({
//               where: { turn_id: { id: turn.id } as any }
//             });
            
//             const allPlayersLostInTurn = allResultsInTurn.length > 0 && allResultsInTurn.every(r => r.result === 'lose');
            
//             if (!allPlayersLostInTurn) {
//               // Player bị thua ở lượt trước và không phải tình huống đặc biệt
//               isEliminatedFromPreviousTurn = true;
//               break;
//             }
//           }
//         }
//       }
      
//       // Tính toán stats chính xác cho người bị lock
//       let actualWins = player.wins;
//       let actualLosses = player.losses;
//       let actualDraws = player.draws;
      
//       if (player.is_locked) {
//         // Người bị lock: gameState đã được cập nhật với auto-wins trong endTurn
//         // Không cần cộng thêm auto-wins nữa, chỉ sử dụng giá trị từ gameState
//         this.logger.log(`🔒 Final rankings - Player ${player.join_id} (locked): wins=${actualWins}, losses=${actualLosses} (from DB), draws=${actualDraws}`);
//       }
      
//       rankings.push({
//         rank: i + 1,
//         player_id: player.join_id,
//         username: player.username,
//         wallet_address: player.wallet_address,
//         total_score: player.points, // Tổng điểm
//         wins: actualWins, // Số lượng lần thắng (đã tính auto-wins cho người bị lock)
//         draws: actualDraws, // Số lượng lần hòa
//         losses: actualLosses, // Số lượng lần thua (tính đúng từ database)
//         points: player.points, // Điểm số (thắng +2, hòa +1, thua +0)
//         status: player.status,
//         join_time: playerJoinTimes.get(player.join_id) || new Date(), // Thời gian tham gia thực tế
//         // Thông tin kết quả cuối cùng
//         final_choice: finalChoice, // Lựa chọn cuối cùng ('rock' | 'paper' | 'scissors' | 'wait')
//         final_result: isEliminatedFromPreviousTurn ? 'lose' : finalResult, // Kết quả cuối cùng (nếu bị thua lượt trước thì chỉ hiển thị 'lose')
//         final_bot_choice: gameState.bot_choice, // Bot chọn gì trong lượt cuối
//         is_eliminated_from_previous_turn: isEliminatedFromPreviousTurn // Bị thua ở lượt trước
//       });
//     }

//     // Tạo kết quả game session vào database (xử lý song song)
//     this.rpsService.createGameSessionResults(session_id, rankings)
//       .then(success => {
//         if (success) {
//           this.logger.log(`✅ Game session results created successfully`);
//         } else {
//           this.logger.warn(`⚠️ Failed to create game session results`);
//         }
//       })
//       .catch(error => {
//         this.logger.error(`❌ Error creating game session results:`, error);
//       });

//     // Lấy prizes thực tế từ database
//     const prizes = await this.rpsService.getRoomPrizes(session_id);

//     this.server.to(`rps-room-${session_id}`).emit('game-ended', {
//       session_id,
//       winner,
//       final_rankings: rankings,
//       prizes: prizes.map(p => ({ rank: p.rank, percent: p.percent })),
//       total_rounds: gameState.current_turn,
//     });
//     this.logger.log(`📢 Sent game-ended event: winner ${winner?.join_id}, rankings: ${rankings.length}, prizes: ${prizes.length}, rounds: ${gameState.current_turn}`);

//     // Tạo session mới sau khi game kết thúc (với delay)
//     setTimeout(async () => {
//       try {
//         // Lấy thông tin room từ session hiện tại
//         const currentSession = await this.rpsService.getGameSession(session_id);
//         if (currentSession && currentSession.room_id) {
//           this.logger.log(`🔄 Creating new game session for room ${currentSession.room_id.id} after ${this.NEW_SESSION_DELAY}s delay (game ${session_id} ended)`);
          
//           const newSession = await this.sessionCreationService.createGameSession(currentSession.room_id);
//           this.logger.log(`✅ Successfully created new game session ${newSession.id} for room ${currentSession.room_id.id} after ${this.NEW_SESSION_DELAY}s delay`);
          
//           // Thông báo cho tất cả players về session mới
//           this.server.to(`rps-room-${session_id}`).emit('new-session-created', {
//             old_session_id: session_id,
//             new_session_id: newSession.id,
//             room_id: currentSession.room_id.id,
//             message: 'New game session is ready!',
//             delay_seconds: this.NEW_SESSION_DELAY
//           });
//           this.logger.log(`📢 Sent new-session-created event: old session ${session_id} → new session ${newSession.id} (after ${this.NEW_SESSION_DELAY}s delay)`);
//         } else {
//           this.logger.warn(`⚠️ Could not find room information for session ${session_id}, skipping new session creation`);
//         }
//       } catch (error) {
//         this.logger.error(`❌ Failed to create new game session after game ${session_id} ended:`, error);
//       }
//     }, this.NEW_SESSION_DELAY * 1000);

//     this.logger.log(`🎉 Game completed for session ${session_id}: winner ${winner?.join_id}, total rounds: ${gameState.current_turn}`);
//   }

//   // Phương thức để gửi lỗi
//   async sendError(session_id: number, error_type: string, message: string) {
//     this.server.to(`rps-room-${session_id}`).emit('game-error', {
//       error_type,
//       message,
//     });

//     this.logger.error(`🚨 Game error in room ${session_id}: ${error_type} - ${message}`);
//   }

//   // Xử lý người chơi rời phòng
//   private async handlePlayerLeave(session_id: number, join_id: number) {
//     // Load game state từ database
//     const gameState = await this.rpsService.loadGameState(session_id);
//     if (!gameState) return;

//     this.logger.log(`👋 Handling player leave: session ${session_id}, join_id ${join_id}`);

//     // Tìm người chơi và đánh dấu là rời phòng (KHÔNG tính losses)
//     const player = gameState.players.find(p => p.join_id === join_id);
//     if (player) {
//       player.status = 'left';
//       // KHÔNG tăng losses khi disconnect/reload - chỉ đánh dấu status
//       this.logger.log(`📝 Marked player ${join_id} as left (no losses added for disconnect/reload)`);
      
//       // Lưu game state vào database để lưu trạng thái 'left'
//       await this.rpsService.saveGameState(session_id, gameState);
//       this.logger.log(`💾 Saved player leave status to database: player ${join_id} marked as left`);
//     }

//     // Xóa khỏi game room
//     const socketIds = this.gameRooms.get(session_id);
//     if (socketIds) {
//       for (const socketId of socketIds) {
//         const playerInfo = this.playerSockets.get(socketId);
//         if (playerInfo && playerInfo.join_id === join_id) {
//           socketIds.delete(socketId);
//           this.logger.log(`🗑️ Removed socket ${socketId} from game room ${session_id}`);
//           break;
//         }
//       }
//     }

//     // Thông báo cho người chơi khác (đã qua grace, rời hẳn)
//     this.server.to(`rps-room-${session_id}`).emit('player-left', {
//       player_id: join_id,
//       players_remaining: gameState.players.filter(p => p.status === 'active'),
//     });
//     this.logger.log(`📢 Sent player-left event: player ${join_id}, remaining: ${gameState.players.filter(p => p.status === 'active').length}`);

//     // Kiểm tra game có cần kết thúc không
//     const activePlayers = gameState.players.filter(p => p.status === 'active');
//     if (activePlayers.length <= 1 && gameState.status === 'running') {
//       // Chỉ còn 1 người chơi, kết thúc game
//       this.logger.log(`🏁 Only ${activePlayers.length} active players remaining, ending game`);
//       setTimeout(() => {
//         this.logger.log(`⏰ ${this.GAME_END_DELAY}-second delay finished, ending game due to player leave`);
//         this.endGame(session_id);
//       }, this.GAME_END_DELAY * 1000);
//     }

//     this.logger.log(`✅ Player leave handled: ${join_id} left room ${session_id}`);
//   }

//   // Lấy danh sách người chơi hiện tại từ database
//   private async getCurrentPlayers(session_id: number): Promise<any[]> {
//     // Lấy từ database
//     const gameState = await this.rpsService.loadGameState(session_id);
//     if (!gameState) return [];
    
//     // Kết hợp với thông tin socket hiện tại
//     const players = gameState.players.map(player => {
//       const socketInfo = Array.from(this.playerSockets.entries())
//         .find(([_, info]) => info.join_id === player.join_id);
      
//       return {
//         join_id: player.join_id,
//         wallet_address: player.wallet_address,
//         username: player.username,
//         socket_id: socketInfo ? socketInfo[0] : '',
//         status: player.status,
//         wins: player.wins,
//         losses: player.losses,
//         draws: player.draws,
//       };
//     });

//     return players;
//   }

//   // Gửi thông tin game hiện tại cho player mới join
//   private async sendCurrentGameInfo(session_id: number, client: Socket, gameState: GameState) {
//     try {
//       // Lấy thông tin turn hiện tại từ database
//       const currentTurn = await this.rpsService.getCurrentTurn(session_id);
//       if (!currentTurn) {
//         this.logger.warn(`❌ No current turn found for session ${session_id}`);
//         return;
//       }

//       // Lấy danh sách players đang online với username
//       const onlinePlayers = gameState.players
//         .filter(p => p.status === 'active' && this.isPlayerOnline(p.join_id))
//         .map(player => ({
//           join_id: player.join_id,
//           wallet_address: player.wallet_address,
//           username: player.username,
//           socket_id: player.socket_id,
//           status: player.status,
//           wins: player.wins,
//           losses: player.losses,
//           draws: player.draws,
//         }));
      
//       // Tính thời gian còn lại
//       const timeRemaining = Math.max(0, this.TURN_TIME_LIMIT - Math.floor((Date.now() - gameState.turn_start_time.getTime()) / 1000));
//       this.logger.log(`⏰ Time calculation: TURN_TIME_LIMIT=${this.TURN_TIME_LIMIT}s, turn_start_time=${gameState.turn_start_time.toISOString()}, current_time=${new Date().toISOString()}, timeRemaining=${timeRemaining}s`);

//       // Gửi bot choice trước (nếu được bật)
//       if (this.SEND_BOT_CHOICE_IMMEDIATELY) {
//         client.emit('bot-choice', {
//         session_id,
//           turn_number: gameState.current_turn,
//           bot_choice: gameState.bot_choice,
//         });
//       }

//       // Gửi thông tin turn hiện tại (giống như turn-start event)
//       const reconnectTurnStartData: any = {
//         session_id,
//         turn_number: gameState.current_turn,
//         time_limit: timeRemaining, // Sử dụng thời gian còn lại thực tế thay vì 15s
//         players: onlinePlayers,
//         time_remaining: timeRemaining, // Thời gian còn lại
//         is_reconnect: true // Đánh dấu đây là reconnect
//       };
      
//       if (this.SEND_BOT_CHOICE_IMMEDIATELY) {
//         reconnectTurnStartData.bot_choice = gameState.bot_choice;
//       }
      
//       client.emit('turn-start', reconnectTurnStartData);

//       // Emit thông tin quyền chơi cho player reconnect
//       const playerInfo = this.playerSockets.get(client.id);
//       if (playerInfo) {
//         // Tính toán can_play cho player reconnect (tương tự logic trong join-game-room)
//         let can_play_reconnect = false;
//         if (playerInfo.join_id > 0 && gameState.status === 'running' && gameState.current_turn > 0) {
//           const userPlayer = gameState.players.find(p => p.join_id === playerInfo.join_id);
//           if (userPlayer && userPlayer.status === 'active') {
//             if (gameState.current_turn > 1) {
//               // Kiểm tra user có bị loại trong lượt trước không
//               const currentTurn = await this.rpsService.getCurrentTurn(session_id);
//               if (currentTurn) {
//                 const previousTurns = await this.gameRpsTurnsRepository.find({
//                   where: {
//                     session_id: { id: session_id } as any,
//                     turn_number: LessThan(currentTurn.turn_number)
//                   },
//                   order: { turn_number: 'DESC' }
//                 });
                
//                 let isEliminated = false;
//                 for (const turn of previousTurns) {
//                   const userResult = await this.gameRpsResultsRepository.findOne({
//                     where: {
//                       join_id: { id: playerInfo.join_id } as any,
//                       turn_id: { id: turn.id } as any
//                     }
//                   });
                  
//                   if (userResult && userResult.result === 'lose') {
//                     const allResultsInTurn = await this.gameRpsResultsRepository.find({
//                       where: { turn_id: { id: turn.id } as any }
//                     });
                    
//                     const allPlayersLostInTurn = allResultsInTurn.length > 0 && allResultsInTurn.every(r => r.result === 'lose');
                    
//                     if (allPlayersLostInTurn) {
//                       break; // Tất cả thua = user vẫn có thể chơi
//                     } else {
//                       isEliminated = true;
//                       break;
//                     }
//                   }
//                 }
                
//                 can_play_reconnect = !isEliminated;
//               }
//             } else {
//               can_play_reconnect = true; // Lượt đầu tiên
//             }
//           }
//         }

//         // Gửi thông tin quyền chơi khác nhau cho participant và watcher
//         if (playerInfo.join_id > 0) {
//           client.emit('player-turn-permission', {
//             session_id,
//             current_turn: gameState.current_turn,
//             can_play: can_play_reconnect,
//             message: can_play_reconnect ? 'You can play the current turn' : 'You cannot play the current turn',
//             reason: can_play_reconnect ? 'active_player' : (gameState.status !== 'running' ? 'game_not_running' : 'eliminated_or_inactive'),
//             is_reconnect: true
//           });
//         } else {
//           client.emit('player-turn-permission', {
//             session_id,
//             current_turn: gameState.current_turn,
//             can_play: false,
//             message: 'You are watching this game',
//             reason: 'watcher_mode',
//             is_reconnect: true
//           });
//         }
//       }

//       // Gửi lựa chọn của các players khác (nếu có)
//       if (gameState.player_choices.size > 0) {
//         for (const [joinId, choice] of gameState.player_choices.entries()) {
//           client.emit('player-choice-update', {
//             session_id,
//             player_id: joinId,
//             choice,
//             time_remaining: timeRemaining,
//             can_change: true,
//             message: 'Previous choice'
//           });
//         }
//       }

//       // Gửi bảng xếp hạng khi reload
//       await this.sendTurnRankingsOnTurnStart(session_id, gameState);

//       this.logger.log(`📢 Sent current game info to reconnected player: session ${session_id}, turn ${gameState.current_turn}, bot_choice: ${gameState.bot_choice}, time_remaining: ${timeRemaining}s`);
//     } catch (error) {
//       this.logger.error(`🚨 Error sending current game info: ${error.message}`, error.stack);
//     }
//   }

//   // Lấy thông tin wallet từ socket
//   private getWalletFromSocket(client: Socket): { wallet_address: string; join_id: number } | null {
//     const playerInfo = this.playerSockets.get(client.id);
//     if (!playerInfo) return null;
    
//     return {
//       wallet_address: playerInfo.wallet_address,
//       join_id: playerInfo.join_id,
//     };
//   }

//   // Kiểm tra wallet có online không
//   private isWalletOnline(wallet_address: string): boolean {
//     const walletSockets = this.walletSockets.get(wallet_address);
//     return walletSockets ? walletSockets.size > 0 : false;
//   }

//   // Lấy socket đầu tiên của wallet (hoặc có thể trả về tất cả)
//   private getWalletSocket(wallet_address: string): string | null {
//     const walletSockets = this.walletSockets.get(wallet_address);
//     if (walletSockets && walletSockets.size > 0) {
//       return Array.from(walletSockets)[0]; // Trả về socket đầu tiên
//     }
//     return null;
//   }

//   // Lấy tất cả socket của wallet
//   private getWalletSockets(wallet_address: string): string[] {
//     const walletSockets = this.walletSockets.get(wallet_address);
//     return walletSockets ? Array.from(walletSockets) : [];
//   }

//   // Lấy số lượng người chơi trong phòng
//   getPlayerCount(session_id: number): number {
//     return this.gameRooms.get(session_id)?.size || 0;
//   }

//   // Kiểm tra người chơi có trong phòng không
//   isPlayerInRoom(session_id: number, join_id: number): boolean {
//     const socketIds = this.gameRooms.get(session_id) || new Set();
    
//     for (const socketId of socketIds) {
//       const playerInfo = this.playerSockets.get(socketId);
//       if (playerInfo && playerInfo.join_id === join_id) {
//         return true;
//       }
//     }
    
//     return false;
//   }

//   // Gửi bảng xếp hạng khi bắt đầu lượt mới
//   private async sendTurnRankingsOnTurnStart(session_id: number, gameState: GameState) {
//     try {
//       // Lấy thông tin thời gian tham gia từ database
//       const sessionPlayers = await this.rpsService.getSessionPlayers(session_id);
//       const playerJoinTimes = new Map<number, Date>();
//       sessionPlayers.forEach(player => {
//         playerJoinTimes.set(player.id, player.time_join);
//       });

//       // Tạo bảng xếp hạng với thông tin lượt mới
//       const sortedPlayers = gameState.players.sort((a, b) => {
//         // Sắp xếp theo điểm số (points), sau đó theo thời gian tham gia
//         if (a.points !== b.points) return b.points - a.points; // Điểm cao hơn xếp trước
        
//         // Cùng điểm thì tham gia sớm hơn xếp trước
//         const joinTimeA = playerJoinTimes.get(a.join_id);
//         const joinTimeB = playerJoinTimes.get(b.join_id);
//         if (joinTimeA && joinTimeB) {
//           return joinTimeA.getTime() - joinTimeB.getTime();
//         }
//         return a.join_id - b.join_id; // Fallback nếu không có thời gian
//       });

//       // Tạo rankings với thông tin lượt mới (chưa có lựa chọn)
//       const currentRankings = [];
//       for (let i = 0; i < sortedPlayers.length; i++) {
//         const player = sortedPlayers[i];
        
//         // Kiểm tra player có bị thua ở lượt trước không và lấy dữ liệu kết quả thua
//         let isEliminatedFromPreviousTurn = false;
//         let eliminatedChoice = 'wait';
//         let eliminatedResult = 'waiting';
//         let eliminatedBotChoice = 'wait';
        
//         if (gameState.current_turn > 1) {
//           // Lấy tất cả các lượt trước đó
//           const previousTurns = await this.gameRpsTurnsRepository.find({
//             where: {
//               session_id: { id: session_id } as any,
//               turn_number: LessThan(gameState.current_turn)
//             },
//             order: { turn_number: 'DESC' }
//           });
          
//           for (const turn of previousTurns) {
//             const playerResult = await this.gameRpsResultsRepository.findOne({
//               where: {
//                 join_id: { id: player.join_id } as any,
//                 turn_id: { id: turn.id } as any
//               }
//             });
            
//             if (playerResult && playerResult.result === 'lose') {
//               // Kiểm tra tình huống đặc biệt: Tất cả người chơi đều thua ở lượt này
//               const allResultsInTurn = await this.gameRpsResultsRepository.find({
//                 where: { turn_id: { id: turn.id } as any }
//               });
              
//               const allPlayersLostInTurn = allResultsInTurn.length > 0 && allResultsInTurn.every(r => r.result === 'lose');
              
//               if (!allPlayersLostInTurn) {
//                 // Player bị thua ở lượt trước và không phải tình huống đặc biệt
//                 isEliminatedFromPreviousTurn = true;
                
//                 // Lấy dữ liệu kết quả thua cuối cùng
//                 eliminatedChoice = playerResult.select || 'wait';
//                 eliminatedResult = 'lose';
//                 eliminatedBotChoice = turn.bot_select || 'wait';
                
//                 this.logger.log(`📊 Player ${player.join_id} eliminated in turn ${turn.turn_number}: choice=${eliminatedChoice}, result=${eliminatedResult}, bot=${eliminatedBotChoice}`);
//                 break;
//               }
//             }
//           }
//         }
        
//         // Xác định dữ liệu hiển thị
//         let displayChoice, displayResult, displayBotChoice;
        
//         if (isEliminatedFromPreviousTurn) {
//           // Người thua: hiển thị dữ liệu kết quả thua cuối cùng
//           displayChoice = eliminatedChoice;
//           displayResult = eliminatedResult;
//           displayBotChoice = eliminatedBotChoice;
//         } else {
//           // Người chơi bình thường: hiển thị trạng thái lượt mới
//           displayChoice = 'wait';
//           displayResult = 'waiting';
//           displayBotChoice = 'wait';
//         }
        
//         currentRankings.push({
//           rank: i + 1,
//           player_id: player.join_id,
//           username: player.username,
//           wallet_address: player.wallet_address,
//           total_score: player.points, // Tổng điểm
//           wins: player.wins, // Số lượng lần thắng
//           draws: player.draws, // Số lượng lần hòa
//           losses: player.losses, // Số lượng lần thua
//           points: player.points, // Điểm số (thắng +2, hòa +1, thua +0)
//           status: player.status,
//           join_time: playerJoinTimes.get(player.join_id) || new Date(), // Thời gian tham gia thực tế
//           // Thông tin hiển thị (khác nhau cho người thua và người chơi bình thường)
//           current_choice: displayChoice, // Lựa chọn (người thua: lựa chọn thua cuối, người chơi: 'wait')
//           current_result: displayResult, // Kết quả (người thua: 'lose', người chơi: 'waiting')
//           current_bot_choice: displayBotChoice, // Bot choice (người thua: bot choice lượt thua, người chơi: 'wait')
//           is_eliminated_from_previous_turn: isEliminatedFromPreviousTurn, // Bị thua ở lượt trước
//           can_play_current_turn: !isEliminatedFromPreviousTurn && player.status === 'active' && !player.is_locked // Có thể chơi lượt hiện tại
//         });
//       }

//       // Emit bảng xếp hạng khi bắt đầu lượt mới
//       this.server.to(`rps-room-${session_id}`).emit('turn-rankings', {
//         session_id,
//         turn_number: gameState.current_turn,
//         rankings: currentRankings,
//         turn_results: [], // Chưa có kết quả vì lượt mới bắt đầu
//         message: `New turn ${gameState.current_turn} started - rankings updated`
//       });
//       this.logger.log(`📊 Sent turn-rankings on turn start: turn ${gameState.current_turn}, ${currentRankings.length} players ranked`);
//     } catch (error) {
//       this.logger.error(`❌ Error sending turn rankings on turn start:`, error);
//     }
//   }

//   // Kiểm tra player có đang online không
//   isPlayerOnline(join_id: number): boolean {
//     for (const [socketId, playerInfo] of this.playerSockets.entries()) {
//       if (playerInfo.join_id === join_id) {
//         // Kiểm tra socket có còn kết nối không
//         if (this.server && this.server.sockets) {
//           // Thử nhiều cách để lấy socket
//           let socket = null;
          
//           // Cách 1: this.server.sockets.sockets.get()
//           if (this.server.sockets.sockets) {
//             socket = this.server.sockets.sockets.get(socketId);
//           }
          
//           // Cách 2: this.server.sockets.adapter.rooms
//           if (!socket && this.server.sockets.adapter && this.server.sockets.adapter.rooms) {
//             const room = this.server.sockets.adapter.rooms.get(socketId);
//             if (room) {
//               socket = { connected: true }; // Giả định connected nếu có trong adapter
//             }
//           }
          
//           // Cách 3: Fallback - nếu có trong playerSockets thì coi như online
//           if (!socket) {
//             this.logger.log(`🔍 Player ${join_id} socket ${socketId} not found in server, but exists in playerSockets - assuming online`);
//             return true; // Fallback: nếu có trong playerSockets thì coi như online
//           }
          
//           const isConnected = socket && socket.connected;
//           this.logger.log(`🔍 Checking player ${join_id} online status: socket ${socketId}, connected: ${isConnected}`);
//           return isConnected;
//         }
//         this.logger.log(`🔍 Player ${join_id} socket check failed: server structure missing`);
//         return false;
//       }
//     }
//     this.logger.log(`🔍 Player ${join_id} not found in playerSockets`);
//     return false;
//   }

// }

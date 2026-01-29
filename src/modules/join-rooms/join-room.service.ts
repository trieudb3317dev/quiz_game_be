import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JoinRoom } from './join-room.entity';
import { Repository } from 'typeorm';
import { Room } from '../rooms/room.entity';
import { User } from '../users/user.entity';
import { JoinersResponseDto, QueryDto, ResponseDto } from './join-room.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class JoinRoomService {
  private readonly logger = new Logger(JoinRoomService.name);
  constructor(
    @InjectRepository(JoinRoom)
    private readonly joinRoomRepository: Repository<JoinRoom>,
    @InjectRepository(Room)
    private readonly roomRepository: Repository<Room>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async joinRoom(userId: number, roomId: number): Promise<{ message: string }> {
    this.logger.log(`User ${userId} is attempting to join room ${roomId}`);
    // Implementation logic goes here
    try {
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (!user) {
        this.logger.error(`User with ID ${userId} not found`);
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      const room = await this.roomRepository.findOne({ where: { id: roomId } });
      if (!room) {
        this.logger.error(`Room with ID ${roomId} not found`);
        throw new HttpException('Room not found', HttpStatus.NOT_FOUND);
      }

      const existingJoin = await this.joinRoomRepository.findOne({
        where: { user: { id: userId }, room: { id: roomId } },
      });
      if (existingJoin) {
        this.logger.error(`User ${userId} already joined room ${roomId}`);
        throw new HttpException(
          'User already joined this room',
          HttpStatus.BAD_REQUEST,
        );
      }

      const joinRoom = this.joinRoomRepository.create({
        user,
        room,
      });
      await this.joinRoomRepository.save(joinRoom);
      this.logger.log(`User ${userId} successfully joined room ${roomId}`);
      this.eventEmitter.emit('JoinRoom.joined', {
        roomId: roomId,
        userId: userId,
      });
      return { message: 'Joined room successfully' };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Unexpected error: ${error.message}`);
      throw new HttpException(
        'Internal server error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async leaveRoom(
    userId: number,
    roomId: number,
  ): Promise<{ message: string }> {
    this.logger.log(`User ${userId} is attempting to leave room ${roomId}`);
    // Implementation logic goes here
    try {
      const joinRoom = await this.joinRoomRepository.findOne({
        where: { user: { id: userId }, room: { id: roomId } },
      });
      if (!joinRoom) {
        this.logger.error(`User ${userId} has not joined room ${roomId}`);
        throw new HttpException(
          'User has not joined this room',
          HttpStatus.BAD_REQUEST,
        );
      }
      await this.joinRoomRepository.remove(joinRoom);
      this.logger.log(`User ${userId} successfully left room ${roomId}`);
      return { message: 'Left room successfully' };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Unexpected error: ${error.message}`);
      throw new HttpException(
        'Internal server error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Get all joiners of a room
  async getJoinersByRoom(
    roomId: number,
    query: QueryDto,
  ): Promise<ResponseDto<JoinersResponseDto>> {
    this.logger.log(`Retrieving joiners for room ${roomId}`);
    try {
      const {
        search,
        sortBy = 'joined_at',
        sortOrder = 'DESC',
        page = 1,
        limit = 10,
      } = query || {};
      const offset = (page - 1) * limit;

      const room = await this.roomRepository.findOne({ where: { id: roomId } });
      if (!room) {
        this.logger.error(`Room with ID ${roomId} not found`);
        throw new HttpException('Room not found', HttpStatus.NOT_FOUND);
      }

      const qb = this.joinRoomRepository
        .createQueryBuilder('join_room')
        .leftJoin('join_room.user', 'user')
        .leftJoin('join_room.room', 'room')
        .select([
          'join_room.id',
          'user.id',
          'user.username',
          'user.email',
          'user.full_name',
          'user.avatar_url',
          'room.id',
          'room.name',
          'join_room.joined_at',
        ])
        .where('room.id = :roomId', { roomId });

      if (search && search.trim().length > 0) {
        qb.andWhere(
          '(user.username ILIKE :search OR user.email ILIKE :search OR user.full_name ILIKE :search)',
          { search: `%${search}%` },
        );
      }

      // apply sorting
      const orderColumn =
        sortBy === 'joined_at' ? 'join_room.joined_at' : 'join_room.joined_at';
      qb.orderBy(orderColumn, sortOrder === 'ASC' ? 'ASC' : 'DESC');

      // apply pagination
      qb.skip(offset).take(limit);

      const [rows, totalItems] = await qb.getManyAndCount();

      this.logger.log(`Successfully retrieved joiners for room ${roomId}`);

      if (totalItems === 0) {
        return {
          data: [],
          pagination: {
            page,
            limit,
            totalItems: 0,
            totalPages: 0,
            nextPage: false,
            prevPage: false,
          },
        };
      }

      const totalPages = Math.ceil(totalItems / limit);
      const nextPage = page < totalPages ? page + 1 : false;
      const prevPage = page > 1 ? page - 1 : false;

      return {
        data: rows.map((join) => ({
          id: join.id,
          user_id: join.user.id,
          username: join.user.username,
          email: join.user.email,
          full_name: join.user.full_name,
          avatar_url: join.user.avatar_url,
          room_id: join.room.id,
          name: join.room.name,
          joined_at: join.joined_at,
        })),
        pagination: {
          page,
          limit,
          totalItems,
          totalPages,
          nextPage,
          prevPage,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to retrieve joiners: ${error.message}`);
      throw new HttpException(
        `Internal server error ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Get one joiner record
  async getJoiner(
    joinerId: number,
    roomId: number,
  ): Promise<JoinersResponseDto | null> {
    this.logger.log(
      `Retrieving joiner record for joiner ${joinerId} in room ${roomId}`,
    );
    try {
      const joinRoom = await this.joinRoomRepository
        .createQueryBuilder('join_room')
        .leftJoin('join_room.user', 'user')
        .leftJoin('join_room.room', 'room')
        .select([
          'join_room.id',
          'user.id',
          'user.username',
          'user.email',
          'user.full_name',
          'user.avatar_url',
          'room.id',
          'room.name',
          'join_room.joined_at',
        ])
        .where('user.id = :joinerId', { joinerId })
        .andWhere('room.id = :roomId', { roomId })
        .getOne();

      if (!joinRoom) {
        this.logger.error(
          `Joiner record for joiner ${joinerId} in room ${roomId} not found`,
        );
        throw new HttpException(
          'Joiner record not found',
          HttpStatus.NOT_FOUND,
        );
      }

      return {
        id: joinRoom.id,
        user_id: joinRoom.user.id,
        username: joinRoom.user.username,
        email: joinRoom.user.email,
        full_name: joinRoom.user.full_name,
        avatar_url: joinRoom.user.avatar_url,
        room_id: joinRoom.room.id,
        name: joinRoom.room.name,
        joined_at: joinRoom.joined_at,
      };
    } catch (error) {
      this.logger.error(`Failed to retrieve joiner record: ${error.message}`);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        `Internal server error ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}

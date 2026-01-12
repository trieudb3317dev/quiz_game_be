import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Room } from './room.entity';
import { Repository } from 'typeorm';
import { CreateRoomDto, ResponseDto, RoomDto } from './room.dto';
import { User } from '../users/user.entity';
import { slugify } from 'src/utils/slugify';
import { SubSubject } from '../subjects/sub-subject.entity';
import { Session } from '../sessions/session.entity';

@Injectable()
export class RoomService {
  private readonly logger = new Logger(RoomService.name);
  constructor(
    @InjectRepository(Room)
    private readonly roomRepository: Repository<Room>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(SubSubject)
    private readonly subSubjectRepository: Repository<SubSubject>,
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
  ) {
    this.logger.log('RoomService initialized');
  }

  async createRoom(
    createRoomDto: CreateRoomDto,
    userId: number,
    subSubjectId: number,
  ): Promise<{ message: string }> {
    try {
      const { name, description } = createRoomDto;
      if (!name || name.trim() === '') {
        this.logger.error('Room name is required');
        throw new HttpException(
          'Room name is required',
          HttpStatus.BAD_REQUEST,
        );
      }

      const createdUser = await this.userRepository.findOne({
        where: { id: userId },
      });
      if (!createdUser) {
        this.logger.error(`User with ID ${userId} not found`);
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }
      if (!createdUser.is_owner) {
        this.logger.error(`User with ID ${userId} is not an owner`);
        throw new HttpException(
          'Only owners can create rooms',
          HttpStatus.FORBIDDEN,
        );
      }

      const existingRoom = await this.roomRepository.findOne({
        where: { name: createRoomDto.name },
      });
      if (existingRoom) {
        this.logger.error(
          `Room with name ${createRoomDto.name} already exists`,
        );
        throw new HttpException(
          'Room name already exists',
          HttpStatus.CONFLICT,
        );
      }

      const subSubject = await this.subSubjectRepository.findOne({
        where: { id: subSubjectId },
      });

      if (!subSubject) {
        this.logger.error(`SubSubject with ID ${subSubjectId} not found`);
        throw new HttpException('SubSubject not found', HttpStatus.NOT_FOUND);
      }

      const slug = slugify(createRoomDto.name);

      const session = await this.createSessionForRoom();

      const body = {
        name: createRoomDto.name,
        slug: slug,
        description: description || null,
        created_by: createdUser,
        sub_subject: subSubject,
        session: session,
      };

      const room = this.roomRepository.create(body);
      await this.roomRepository.save(room);
      return { message: 'Room created successfully' };
    } catch (error) {
      if (error instanceof HttpException) {
        this.logger.error(`Error creating room: ${error.message}`);
        throw error;
      }
      this.logger.error(`Unexpected error creating room: ${error.message}`);
      throw new HttpException(
        'Internal server error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getRoomById(id: number): Promise<any> {
    try {
      const room = await this.roomRepository.createQueryBuilder('room')
        .leftJoin('room.created_by', 'created_by')
        .leftJoin('room.sub_subject', 'sub_subject')
        .leftJoin('room.session', 'session')
        .where('room.id = :id', { id })
        .select([
          'room.id',
          'room.name',
          'room.slug',
          'room.description',
          'room.is_active',
          'room.created_at',
          'created_by.id',
          'created_by.username',
          'sub_subject.id',
          'sub_subject.title',
          'session.id',
          'session.token',
          'session.type',
          'session.created_at',
        ])
        .getOne();
        
      if (!room) {
        this.logger.error(`Room with ID ${id} not found`);
        throw new HttpException('Room not found', HttpStatus.NOT_FOUND);
      }
      return {
        id: room.id,
        name: room.name,
        slug: room.slug,
        description: room.description,
        created_at: room.created_at,
        created_by: room.created_by,
        sub_subject: room.sub_subject,
        session: room.session,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        this.logger.error(`Error retrieving room: ${error.message}`);
        throw error;
      }
      this.logger.error(`Unexpected error retrieving room: ${error.message}`);
      throw new HttpException(
        `Internal server error ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async deleteRoom(id: number): Promise<{ message: string }> {
    try {
      await this.roomRepository.delete(id);
      return { message: 'Room deleted successfully' };
    } catch (error) {
      if (error instanceof HttpException) {
        this.logger.error(`Error deleting room: ${error.message}`);
        throw error;
      }
      this.logger.error(`Unexpected error deleting room: ${error.message}`);
      throw new HttpException(
        'Internal server error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async listRooms(): Promise<ResponseDto<RoomDto>> {
    try {
      const rooms = await this.roomRepository
        .createQueryBuilder('room')
        .where('room.is_active = :isActive', { isActive: false })
        .getMany();
      return {
        data: rooms,
        pagination: {
          totalItems: rooms.length,
          totalPages: 1,
          nextPage: false,
          prevPage: false,
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        this.logger.error(`Error listing rooms: ${error.message}`);
        throw error;
      }
      this.logger.error(`Unexpected error listing rooms: ${error.message}`);
      throw new HttpException(
        'Internal server error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async updateRoom(
    id: number,
    data: Partial<Room>,
  ): Promise<{ message: string }> {
    try {
      await this.roomRepository.update(id, data);
      return { message: 'Room updated successfully' };
    } catch (error) {
      if (error instanceof HttpException) {
        this.logger.error(`Error updating room: ${error.message}`);
        throw error;
      }
      this.logger.error(`Unexpected error updating room: ${error.message}`);
      throw new HttpException(
        'Internal server error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Additional room-related methods can be added here
  private async createSessionForRoom(): Promise<Session> {
    // Logic to create a session for the room
    const chars = '0123456789';
    const token = Array.from({ length: 6 })
      .map(() => chars[Math.floor(Math.random() * chars.length)])
      .join('');
    this.logger.log(`Session created with token: ${token}`);

    // Save session to database (not implemented here)
    const session = await this.sessionRepository.save({ token });
    this.logger.log(`Session saved with ID: ${session.id}`);

    return session;
  }
}

import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { GameResult } from './game-result.entity';
import { Repository } from 'typeorm';
import { PaginationDto, QueryDto } from './game-result.dto';

@Injectable()
export class GameResultService {
  private readonly logger = new Logger(GameResultService.name);
  constructor(
    @InjectRepository(GameResult)
    private readonly gameResultRepository: Repository<GameResult>,
  ) {
    this.logger.log('GameResultService initialized');
  }

  async findAll(
    query?: QueryDto,
  ): Promise<{ data: any[]; pagination: PaginationDto }> {
    this.logger.log('Retrieving all game results');
    try {
      const { page = 1, limit = 10, search, order = 'ASC', sortBy = 'created_at' } = query || {};
      const skip = (page - 1) * limit;

      const gameResultQB = this.gameResultRepository
        .createQueryBuilder('game_result')
        .leftJoin('game_result.join_room', 'join_room')
        .leftJoin('join_room.user', 'user')
        .leftJoin('join_room.room', 'room')
        .leftJoin('room.session', 'session');

      // apply search filter
      if (search && search.trim().length > 0) {
        gameResultQB.andWhere(
          '(user.username ILIKE :search OR user.full_name ILIKE :search OR room.name ILIKE :search OR session.token ILIKE :search)',
          { search: `%${search}%` },
        );
      }

      // allowed sort columns mapping (prevent SQL injection)
      const allowedSort: Record<string, string> = {
        created_at: 'game_result.created_at',
        score: 'game_result.score',
        total_score: 'game_result.total_score',
      };
      const orderBy = allowedSort[sortBy] ?? allowedSort['created_at'];

      gameResultQB.select([
        'game_result.id',
        'game_result.score',
        'game_result.accuracy_bonus',
        'game_result.speed_bonus',
        'game_result.total_score',
        'game_result.created_at',
        'join_room.id',
        'user.id',
        'user.username',
        'user.full_name',
        'room.id',
        'room.name',
        'session.id',
        'session.token',
      ]);

      gameResultQB.orderBy(orderBy, order === 'DESC' ? 'DESC' : 'ASC');
      gameResultQB.skip(skip).take(limit);

      const [gameResults, totalItems] = await gameResultQB.getManyAndCount();

      const totalPages = Math.ceil(totalItems / limit) || 0;
      const nextPage = page < totalPages ? page + 1 : false;
      const prevPage = page > 1 ? page - 1 : false;

      return {
        data: gameResults,
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
      if (error instanceof HttpException) {
        this.logger.error(`Failed to retrieve game results: ${error.message}`);
        throw error;
      }
      this.logger.error(`Unexpected error: ${error.message}`);
      throw new HttpException(
        `Failed to retrieve game results ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Get game result by session token and room id
    async findAllSessionToken(
    query?: QueryDto,
    token?: string,
  ): Promise<{ data: any[]; pagination: PaginationDto }> {
    this.logger.log('Retrieving all game results');
    try {
      const { page = 1, limit = 10, search, order = 'ASC', sortBy = 'created_at' } = query || {};
      const skip = (page - 1) * limit;

      const gameResultQB = this.gameResultRepository
        .createQueryBuilder('game_result')
        .leftJoin('game_result.join_room', 'join_room')
        .leftJoin('join_room.user', 'user')
        .leftJoin('join_room.room', 'room')
        .leftJoin('room.session', 'session')
        .where('session.token = :token', { token });

      // apply search filter
      if (search && search.trim().length > 0) {
        gameResultQB.andWhere(
          '(user.username ILIKE :search OR user.full_name ILIKE :search OR room.name ILIKE :search OR session.token ILIKE :search)',
          { search: `%${search}%` },
        );
      }

      // allowed sort columns mapping (prevent SQL injection)
      const allowedSort: Record<string, string> = {
        created_at: 'game_result.created_at',
        score: 'game_result.score',
        total_score: 'game_result.total_score',
      };
      const orderBy = allowedSort[sortBy] ?? allowedSort['created_at'];

      gameResultQB.select([
        'game_result.id',
        'game_result.score',
        'game_result.accuracy_bonus',
        'game_result.speed_bonus',
        'game_result.total_score',
        'game_result.created_at',
        'join_room.id',
        'user.id',
        'user.username',
        'user.full_name',
        'room.id',
        'room.name',
        'session.id',
        'session.token',
      ]);

      gameResultQB.orderBy(orderBy, order === 'DESC' ? 'DESC' : 'ASC');
      gameResultQB.skip(skip).take(limit);

      const [gameResults, totalItems] = await gameResultQB.getManyAndCount();

      const totalPages = Math.ceil(totalItems / limit) || 0;
      const nextPage = page < totalPages ? page + 1 : false;
      const prevPage = page > 1 ? page - 1 : false;

      return {
        data: gameResults,
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
      if (error instanceof HttpException) {
        this.logger.error(`Failed to retrieve game results: ${error.message}`);
        throw error;
      }
      this.logger.error(`Unexpected error: ${error.message}`);
      throw new HttpException(
        `Failed to retrieve game results ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}

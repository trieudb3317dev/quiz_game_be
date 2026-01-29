import { Injectable, Logger, Search } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { AnswerSelect } from './ans-select.entity';
import { Repository } from 'typeorm';
import { QuizAnswer } from '../quizzes/quiz.entity';
import { User } from '../users/user.entity';
import { JoinRoom } from '../join-rooms/join-room.entity';
import { GameResult } from '../game-results/game-result.entity';
import { HttpException, HttpStatus } from '@nestjs/common';
import { PaginationDto, QueryDto } from './ans-select.dto';
import e from 'express';

@Injectable()
export class AnsSelectService {
  private readonly logger = new Logger(AnsSelectService.name);
  constructor(
    @InjectRepository(AnswerSelect)
    private readonly ansSelectRepository: Repository<AnswerSelect>,
    @InjectRepository(QuizAnswer)
    private readonly quizAnswerRepository: Repository<QuizAnswer>,
    @InjectRepository(JoinRoom)
    private readonly joinRoomRepository: Repository<JoinRoom>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(GameResult)
    private readonly gameResultRepository: Repository<GameResult>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * User selects an answer for a quiz (joiner chooses an answer).
   * - Validates user and joinRoom belong to the user
   * - Creates or updates an AnswerSelect record (increment select_count)
   * - Creates a GameResult record recording score for this selection
   */
  async selectAnswer(
    userId: number,
    joinRoomId: number,
    quizAnswerId: number,
    token?: string,
  ): Promise<{ message: string }> {
    try {
      // validate user
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (!user) {
        throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
      }

      // validate joinRoom (load room and session so we can emit later)
      const joinRoom = await this.joinRoomRepository.findOne({
        where: { id: joinRoomId },
        relations: ['room', 'room.session', 'user'],
      } as any);
      if (!joinRoom) {
        throw new HttpException('Joiner not found', HttpStatus.NOT_FOUND);
      }

      if (
        (joinRoom as any).user &&
        (joinRoom as any).user.id &&
        (joinRoom as any).user.id !== userId
      ) {
        // joinRoom does not belong to this user
        throw new HttpException(
          'Forbidden: join room does not belong to user',
          HttpStatus.FORBIDDEN,
        );
      }

      // find quiz answer
      const quizAnswer = await this.quizAnswerRepository.findOne({
        where: { id: quizAnswerId } as any,
        relations: ['quiz'] as any,
      });
      if (!quizAnswer) {
        throw new HttpException('Quiz answer not found', HttpStatus.NOT_FOUND);
      }

      // create or update AnswerSelect
      let ansSelect: any = await this.ansSelectRepository.findOne({
        where: {
          quiz_answer: { id: quizAnswerId },
          join_room: { id: joinRoomId },
        } as any,
        relations: ['quiz_answer', 'join_room'] as any,
      });

      if (ansSelect) {
        ansSelect.select_count = (ansSelect.select_count || 0) + 1;
        await this.ansSelectRepository.save(ansSelect);
      } else {
        ansSelect = this.ansSelectRepository.create({
          quiz_answer: quizAnswer as any,
          join_room: joinRoom as any,
          select_count: 1,
        } as any);
        await this.ansSelectRepository.save(ansSelect);
      }

      // create GameResult
      const existingGameResult = await this.gameResultRepository.findOne({
        where: {
          join_room: { id: joinRoom.id },
        } as any,
        relations: [
          'join_room',
          'join_room.room',
          'join_room.room.session',
        ] as any,
      });

      this.logger.log(
        `Existing GameResult check for joinRoom ${joinRoom.id} and answerSelect ${ansSelect.id}`,
      );

      console.log('existingGameResult', existingGameResult);

      if (existingGameResult) {
        this.logger.log(
          `GameResult already exists for joinRoom ${joinRoom.id} and answerSelect ${ansSelect.id}`,
        );
        // tính toán
        const score = quizAnswer.is_correct
          ? quizAnswer.quiz.score + existingGameResult.score
          : existingGameResult.score;
        const accuracy_bonus = quizAnswer.is_correct ? 5 : 0;
        const speed_bonus = existingGameResult.speed_bonus ?? 0;
        const total_score =
          score + speed_bonus + accuracy_bonus + existingGameResult.total_score;

        // cập nhật (dùng update hoặc save; save giữ entity lifecycle)
        await this.gameResultRepository.update(existingGameResult.id, {
          score,
          accuracy_bonus,
          speed_bonus,
          total_score,
        });
        // emit event so game-result gateway can broadcast updated results
        try {
          const tokenToEmit = (joinRoom.room && (joinRoom.room as any).session && (joinRoom.room as any).session.token) || token;
          if (tokenToEmit) {
            this.eventEmitter.emit('GameResult.created', { token: tokenToEmit });
          }
        } catch (emitErr) {
          this.logger.warn(`Failed to emit GameResult.created: ${emitErr}`);
        }
        return { message: 'GameResult updated successfully' };
      } else {
        const gameResult = this.gameResultRepository.create({
          join_room: joinRoom as any,
          score: quizAnswer.is_correct ? quizAnswer.quiz.score : 0,
          speed_bonus: 0,
          accuracy_bonus: quizAnswer.is_correct ? 5 : 0,
          total_score: quizAnswer.is_correct ? quizAnswer.quiz.score + 5 : 0,
        } as any);
        await this.gameResultRepository.save(gameResult);
        // emit event so game-result gateway can broadcast new result
        try {
          const tokenToEmit = (joinRoom.room && (joinRoom.room as any).session && (joinRoom.room as any).session.token) || token;
          if (tokenToEmit) {
            this.eventEmitter.emit('GameResult.created', { token: tokenToEmit });
          }
        } catch (emitErr) {
          this.logger.warn(`Failed to emit GameResult.created: ${emitErr}`);
        }

        return { message: 'GameResult created successfully' };
      }
    } catch (error) {
      if (error instanceof HttpException) {
        this.logger.error(`Failed to select answer: ${error.message}`);
        throw error;
      }
      this.logger.error(`Unexpected error: ${error.message}`);
      throw new HttpException(
        'Internal server error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Gets answer selects by join room
  async getAnswerSelectsOfRoom(
    subSubjectId: number,
    query?: QueryDto,
  ): Promise<{ data: any[]; pagination?: PaginationDto }> {
    this.logger.log(`Fetching answer selects for quiz ${subSubjectId}`);
    try {
      const {
        page = 1,
        limit = 10,
        sortBy = 'created_at',
        order = 'ASC',
        search,
      } = query || {};
      const offset = (page - 1) * limit;
      const countQb = this.ansSelectRepository
        .createQueryBuilder('answer_select')
        .leftJoin('answer_select.quiz_answer', 'quiz_answer')
        .leftJoin('quiz_answer.quiz', 'quiz')
        .leftJoin('quiz.sub_subject', 'sub_subject');

      // filter by quiz id
      countQb.where('sub_subject.id = :subSubject', {
        subSubject: Number(subSubjectId),
      });

      // apply search to count as well
      if (search && search.trim().length > 0) {
        countQb.andWhere(
          '(answer_select.id::text ILIKE :search OR quiz.title ILIKE :search)',
          { search: `%${search}%` },
        );
      }

      const totalItems = await countQb.getCount();

      const answerSelects = await this.ansSelectRepository
        .createQueryBuilder('answer_select')
        .leftJoin('answer_select.quiz_answer', 'quiz_answer')
        .leftJoin('quiz_answer.quiz', 'quiz')
        .leftJoin('quiz.sub_subject', 'sub_subject')
        .leftJoin('answer_select.join_room', 'join_room')
        .leftJoin('join_room.user', 'user')
        .leftJoin('join_room.room', 'room')
        .where('sub_subject.id = :subSubject', {
          subSubject: Number(subSubjectId),
        })
        .select([
          'answer_select.id',
          'answer_select.select_count',
          'answer_select.created_at',
          'quiz.id',
          'quiz.title',
          'quiz.time_limit',
          'quiz_answer.id',
          'quiz_answer.answer_text',
          'quiz_answer.is_correct',
          'join_room.id',
          'user.id',
          'user.username',
          'user.full_name',
          'room.id',
          'room.name',
        ]);

      answerSelects.orderBy(
        `answer_select.${sortBy}`,
        order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC',
      );

      if (search && search.trim().length > 0) {
        answerSelects.andWhere(
          '(user.username ILIKE :search OR user.full_name ILIKE :search OR room.name ILIKE :search OR quiz.title ILIKE :search)',
          { search: `%${search}%` },
        );
      }

      answerSelects.skip(offset).take(limit);

      const answerSelectsResult = await answerSelects.getMany();

      const totalPages = Math.ceil(totalItems / limit);
      const nextPage = page < totalPages ? page + 1 : false;
      const prevPage = page > 1 ? page - 1 : false;

      if (answerSelectsResult.length === 0) {
        return {
          data: [],
          pagination: {
            page: Number(page),
            limit: Number(limit),
            totalItems,
            totalPages,
            nextPage,
            prevPage,
          },
        };
      }

      return {
        data: answerSelectsResult,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          totalItems,
          totalPages,
          nextPage,
          prevPage,
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        this.logger.error(`Failed to fetch answer selects: ${error.message}`);
        throw error;
      }
      this.logger.error(`Unexpected error: ${error.message}`);
      throw new HttpException(
        `Internal server error: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Gets total answer selects for a quiz for one joiner
  async getTotalAnswerSelectsOfRoomByJoiner(
    joinerId: number,
    subSubjectId: number,
    query?: QueryDto,
  ): Promise<{ data: any[]; pagination?: PaginationDto }> {
    this.logger.log(
      `Fetching answer selects for quiz ${subSubjectId} and joiner ${joinerId}`,
    );
    try {
      const {
        page = 1,
        limit = 10,
        sortBy = 'created_at',
        order = 'ASC',
        search,
      } = query || {};
      const offset = (page - 1) * limit;
      const countQb = this.ansSelectRepository
        .createQueryBuilder('answer_select')
        .leftJoin('answer_select.quiz_answer', 'quiz_answer')
        .leftJoin('quiz_answer.quiz', 'quiz')
        .leftJoin('quiz.sub_subject', 'sub_subject')
        .leftJoin('answer_select.join_room', 'join_room')
        .leftJoin('join_room.user', 'user');

      // filter by quiz id
      countQb
        .where('sub_subject.id = :subSubject', {
          subSubject: Number(subSubjectId),
        })
        .andWhere('join_room.id = :joinerId', { joinerId: Number(joinerId) });

      // apply search to count as well
      if (search && search.trim().length > 0) {
        countQb.andWhere(
          '(answer_select.id::text ILIKE :search OR quiz.title ILIKE :search)',
          { search: `%${search}%` },
        );
      }

      const totalItems = await countQb.getCount();

      const answerSelects = await this.ansSelectRepository
        .createQueryBuilder('answer_select')
        .leftJoin('answer_select.quiz_answer', 'quiz_answer')
        .leftJoin('quiz_answer.quiz', 'quiz')
        .leftJoin('quiz.sub_subject', 'sub_subject')
        .leftJoin('answer_select.join_room', 'join_room')
        .leftJoin('join_room.user', 'user')
        .leftJoin('join_room.room', 'room')
        .where('sub_subject.id = :subSubject', {
          subSubject: Number(subSubjectId),
        })
        .andWhere('join_room.id = :joinerId', { joinerId: Number(joinerId) })
        .select([
          'answer_select.id',
          'answer_select.select_count',
          'answer_select.created_at',
          'quiz.id',
          'quiz.title',
          'quiz.time_limit',
          'quiz_answer.id',
          'quiz_answer.answer_text',
          'quiz_answer.is_correct',
          'join_room.id',
          'user.id',
          'user.username',
          'user.full_name',
          'room.id',
          'room.name',
        ]);

      answerSelects.orderBy(
        `answer_select.${sortBy}`,
        order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC',
      );

      if (search && search.trim().length > 0) {
        answerSelects.andWhere(
          '(user.username ILIKE :search OR user.full_name ILIKE :search OR room.name ILIKE :search OR quiz.title ILIKE :search)',
          { search: `%${search}%` },
        );
      }

      answerSelects.skip(offset).take(limit);

      const answerSelectsResult = await answerSelects.getMany();

      const totalPages = Math.ceil(totalItems / limit);
      const nextPage = page < totalPages ? page + 1 : false;
      const prevPage = page > 1 ? page - 1 : false;

      if (answerSelectsResult.length === 0) {
        return {
          data: [],
          pagination: {
            page: Number(page),
            limit: Number(limit),
            totalItems,
            totalPages,
            nextPage,
            prevPage,
          },
        };
      }

      return {
        data: answerSelectsResult,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          totalItems,
          totalPages,
          nextPage,
          prevPage,
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        this.logger.error(`Failed to fetch answer selects: ${error.message}`);
        throw error;
      }
      this.logger.error(`Unexpected error: ${error.message}`);
      throw new HttpException(
        `Internal server error: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}

import { Injectable, Logger, Search } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AnswerSelect } from './ans-select.entity';
import { Repository } from 'typeorm';
import { QuizAnswer } from '../quizzes/quiz.entity';
import { User } from '../users/user.entity';
import { JoinRoom } from '../join-rooms/join-room.entity';
import { GameResult } from '../game-results/game-result.entity';
import { HttpException, HttpStatus } from '@nestjs/common';
import { PaginationDto, QueryDto } from './ans-select.dto';

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
  ): Promise<{ correct?: boolean; score?: number; answer_select_id: number }> {
    try {
      // validate user
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (!user) {
        throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
      }

      // validate joinRoom
      const joinRoom = await this.joinRoomRepository.findOne({
        where: { id: joinRoomId },
      });
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

      // compute score: if selected answer is correct, award quiz.score (fallback to 0)
      //   const quiz = (quizAnswer as any).quiz as any;
      //   const reward = quiz && quiz.score ? Number(quiz.score) : 0;
      //   const correct = !!quizAnswer.is_correct;
      //   const score = correct ? reward : 0;

      //   // create GameResult record
      //   const gameResult = this.gameResultRepository.create({
      //     join_room: joinRoom as any,
      //     answer_select: ansSelect as any,
      //     score,
      //   } as any);
      //   await this.gameResultRepository.save(gameResult);

      return { answer_select_id: ansSelect.id };
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

import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Quiz, QuizAnswer } from './quiz.entity';
import { Repository, In } from 'typeorm';
import { DataSource } from 'typeorm';
import { SubSubject } from '../subjects/sub-subject.entity';
import { promises as fs } from 'fs';
import * as path from 'path';
import { parseLine } from 'src/utils/parseLine';
import { AnswerDto, QueryDto, QuizDto, ResponseDto } from './quiz.dto';
import { User } from '../users/user.entity';

@Injectable()
export class QuizService {
  // Implement quiz-related business logic here
  private readonly logger = new Logger(QuizService.name);
  constructor(
    @InjectRepository(Quiz)
    private readonly quizRepository: Repository<Quiz>,
    @InjectRepository(QuizAnswer)
    private readonly quizAnswerRepository: Repository<QuizAnswer>,
    @InjectRepository(SubSubject)
    private readonly subSubjectRepository: Repository<SubSubject>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {
    this.logger.log('QuizService initialized');
  }

  // helper: simple CSV parser supporting quoted fields ("," and "" escaping)
  private parseCSV(content: string): Record<string, string>[] {
    // split into logical CSV lines while respecting quoted fields that may contain newlines
    const rawLines: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < content.length; i++) {
      const ch = content[i];
      cur += ch;
      if (ch === '"') {
        // handle escaped double-quote ""
        if (content[i + 1] === '"') {
          cur += content[i + 1];
          i++;
          continue;
        }
        inQuotes = !inQuotes;
        continue;
      }
      if (!inQuotes && ch === '\n') {
        // end of record
        // remove trailing CR if present
        const row = cur.replace(/\r?\n$/, '');
        rawLines.push(row);
        cur = '';
      }
    }
    if (cur.trim() !== '') rawLines.push(cur.replace(/\r?\n$/, ''));
    const lines = rawLines.filter((l) => l.trim() !== '');
    if (lines.length === 0) return [];
    const headerLine = lines.shift()!;
    const headers = parseLine(headerLine);
    return lines.map((ln) => {
      const vals = parseLine(ln);
      const obj: Record<string, string> = {};

      // If a row has more fields than headers (commas inside unquoted title),
      // attempt a best-effort merge: assume layout [sub_subject, title..., slug, description]
      if (vals.length > headers.length && headers.length >= 3) {
        const first = vals[0] ?? '';
        const last = vals[vals.length - 1] ?? '';
        const secondLast = vals[vals.length - 2] ?? '';
        const middle = vals.slice(1, vals.length - 2).join(',');

        // map according to expected header names if present
        obj[headers[0]] = first;
        // place the reconstructed middle as the 'title' if that header exists
        const titleKey = headers[1] ?? 'title';
        obj[titleKey] = middle;
        // slug -> second last, description -> last (if headers include them)
        if (headers.length >= 4) {
          obj[headers[2]] = secondLast;
          obj[headers[3]] = last;
        } else if (headers.length === 3) {
          // if only 3 headers, map last two into the last header by joining
          obj[headers[2]] = [secondLast, last].filter(Boolean).join(',');
        }
      } else {
        headers.forEach((h, idx) => {
          obj[h] = vals[idx] ?? '';
        });
      }

      return obj;
    });
  }

  // helper: convert rows (array of objects) to CSV string
  private toCSV(rows: Record<string, any>[], columns: string[]): string {
    const escape = (v: any) => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      if (s.includes('"')) return `"${s.replace(/"/g, '""')}"`;
      if (s.includes(',') || s.includes('\n') || s.includes('\r'))
        return `"${s}"`;
      return s;
    };
    const header = columns.join(',');
    const lines = rows.map((r) => columns.map((c) => escape(r[c])).join(','));
    return [header, ...lines].join('\n');
  }

  // Import from csv directory (expects quizzes.csv and quiz_answers.csv)
  async importQuizzesFromCSV(filePath: string, userId: number): Promise<void> {
    try {
      // Permission check should be done in controller/guard layer
      // Only owners/admins should be able to call this method
      if (!userId) {
        throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
      }

      const owner = await this.userRepository.findOne({
        where: { id: userId },
      });

      if (!owner || !owner.is_owner) {
        throw new HttpException(
          'Only owners or admins can import quizzes',
          HttpStatus.FORBIDDEN,
        );
      }

      // accept either folder or a csv file path (use parent folder)
      let dir = filePath;
      if (filePath.endsWith('.csv')) {
        dir = path.dirname(filePath);
      }

      const quizzesPath = path.join(dir, 'quizzes.csv');
      const answersPath = path.join(dir, 'quiz_answers.csv');

      this.logger.log(`Import: checking ${quizzesPath} and ${answersPath}`);

      let quizzesContent: string | null = null;
      let answersContent: string | null = null;
      try {
        quizzesContent = await fs.readFile(quizzesPath, 'utf8');
      } catch (e) {
        this.logger.log(`quizzes.csv not found at ${quizzesPath}`);
      }
      try {
        answersContent = await fs.readFile(answersPath, 'utf8');
      } catch (e) {
        this.logger.log(`quiz_answers.csv not found at ${answersPath}`);
      }

      if (!quizzesContent && !answersContent) {
        throw new HttpException(
          'No import files found (quizzes.csv or quiz_answers.csv)',
          HttpStatus.BAD_REQUEST,
        );
      }

      const quizRows = quizzesContent ? this.parseCSV(quizzesContent) : [];
      const answerRows = answersContent ? this.parseCSV(answersContent) : [];

      console.group('Import Data Summary');
      console.log(`Quizzes to import: ${quizRows.length}`);
      console.log(`Answers to import: ${answerRows.length}`);
      const quizSample = quizRows.length > 0 ? quizRows[3] : null;
      console.log('Sample quiz row:', quizSample);
      console.groupEnd();

      // Map to keep slug/id -> saved Quiz
      const quizMap = new Map<string | number, Quiz>();

      // Use a transaction so quizzes and answers are imported atomically when both provided
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();
      try {
        // Process quizzes: expect sub_subject column to contain SubSubject id (number)
        for (const row of quizRows) {
          // columns expected: sub_subject, title, slug, description
          const subSubjectVal = row['sub_subject'] ?? '';
          const title = row['title'] ?? '';
          const slug = row['slug'] ?? '';
          const description = row['description'] ?? null;

          if (!slug || !title) {
            this.logger.warn(
              `Skipping quiz with missing title or slug: ${JSON.stringify(row)}`,
            );
            continue;
          }

          let subSubject = null;
          const subId = Number(subSubjectVal);
          if (!Number.isNaN(subId) && subId > 0) {
            subSubject = await this.subSubjectRepository
              .findOne({ where: { id: subId } as any })
              .catch(() => null);
          }
          if (!subSubject) {
            this.logger.warn(
              `SubSubject not found for value "${subSubjectVal}", quiz "${slug}" will have null sub_subject`,
            );
          }

          const quiz = this.quizRepository.create({
            sub_subject: subSubject ?? null,
            title,
            slug,
            description: description === '' ? null : description,
          } as Quiz);

          const saved = await queryRunner.manager
            .getRepository(Quiz)
            .save(quiz as any);

          // map by id, slug and title to support different reference formats in answers CSV
          quizMap.set(String(saved.id), saved);
          if (saved.slug) quizMap.set(saved.slug, saved);
          if (saved.title) quizMap.set(saved.title, saved);
        }

        // Process answers: columns expected: quiz, answer_text, is_correct, image_url?
        for (const row of answerRows) {
          const quizVal =
            row['quiz'] ??
            row['quiz_id'] ??
            row['quizSlug'] ??
            row['quiz_title'] ??
            row['quizTitle'] ??
            '';
          const type_answer = row['answer_type'] ?? row['answerType'] ?? 'text';
          const answer_text = row['answer_text'] ?? row['answerText'] ?? '';
          const is_correct_raw = (row['is_correct'] ?? row['isCorrect'] ?? '')
            .toString()
            .toLowerCase();
          const image_url = row['image_url'] ?? row['imageUrl'] ?? null;

          if (!quizVal) {
            this.logger.warn(
              `Skipping answer with missing quiz reference: ${JSON.stringify(row)}`,
            );
            continue;
          }

          // find saved quiz by id or slug; if not in map, try DB lookup (use transaction manager)
          let quizEntity: Quiz | undefined = quizMap.get(quizVal);
          if (!quizEntity) {
            const maybeId = Number(quizVal);
            if (!Number.isNaN(maybeId) && maybeId > 0) {
              quizEntity = await queryRunner.manager
                .getRepository(Quiz)
                .findOne({ where: { id: maybeId } as any })
                .catch(() => null);
            }
            if (!quizEntity) {
              quizEntity = await queryRunner.manager
                .getRepository(Quiz)
                .findOne({ where: { slug: quizVal } as any })
                .catch(() => null);
            }
            // try lookup by title if still not found
            if (!quizEntity && quizVal && typeof quizVal === 'string') {
              quizEntity = await queryRunner.manager
                .getRepository(Quiz)
                .findOne({ where: { title: quizVal } as any })
                .catch(() => null);
            }
            if (quizEntity) {
              quizMap.set(String(quizEntity.id), quizEntity);
              if (quizEntity.slug) quizMap.set(quizEntity.slug, quizEntity);
              if (quizEntity.title) quizMap.set(quizEntity.title, quizEntity);
            }
          }

          if (!quizEntity) {
            this.logger.warn(
              `Quiz not found for answer row: ${JSON.stringify(row)} - skipping`,
            );
            continue;
          }

          const is_correct = ['1', 'true', 'yes', 'y'].includes(is_correct_raw);

          const answer = queryRunner.manager.getRepository(QuizAnswer).create({
            quiz: quizEntity,
            answer_type: type_answer,
            answer_text,
            is_correct,
            image_url: image_url === '' ? null : image_url,
          } as any);

          await queryRunner.manager
            .getRepository(QuizAnswer)
            .save(answer as any);
        }

        // commit transaction
        await queryRunner.commitTransaction();
      } catch (innerErr) {
        // rollback and rethrow
        await queryRunner.rollbackTransaction();
        throw innerErr;
      } finally {
        await queryRunner.release();
      }
      this.logger.log('Import completed successfully');
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      }
      this.logger.error(`Import failed ${err.message}`, err as any);
      throw new HttpException(
        `Import failed ${err.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Export to csv: writes quizzes.csv and quiz_answers.csv into folder filePath (if filePath endsWith .csv use parent folder)
  async exportQuizzesToCSV(filePath: string): Promise<void> {
    try {
      let dir = filePath;
      if (filePath.endsWith('.csv')) {
        dir = path.dirname(filePath);
      }
      await fs.mkdir(dir, { recursive: true });

      this.logger.log(`Export: preparing data from DB`);

      const quizzes = await this.quizRepository.find();
      const answers = await this.quizAnswerRepository.find({
        relations: ['quiz'] as any,
      });

      const quizzesRows = quizzes.map((q) => ({
        id: q.id,
        sub_subject: q.sub_subject ? ((q.sub_subject as any).id ?? '') : '',
        title: q.title,
        slug: q.slug,
        description: q.description ?? '',
        created_at: q.created_at ? q.created_at.toISOString() : '',
      }));

      const answersRows = answers.map((a) => ({
        id: a.id,
        quiz: a.quiz ? ((a.quiz as any).id ?? '') : '',
        answer_text: a.answer_text,
        is_correct: a.is_correct ? '1' : '0',
        image_url: a.image_url ?? '',
        created_at: a.created_at ? a.created_at.toISOString() : '',
      }));

      const quizzesCsv = this.toCSV(quizzesRows, [
        'id',
        'sub_subject',
        'title',
        'slug',
        'description',
        'created_at',
      ]);
      const answersCsv = this.toCSV(answersRows, [
        'id',
        'quiz',
        'answer_text',
        'is_correct',
        'image_url',
        'created_at',
      ]);

      const quizzesPath = path.join(dir, 'quizzes.csv');
      const answersPath = path.join(dir, 'quiz_answers.csv');

      await Promise.all([
        fs.writeFile(quizzesPath, quizzesCsv, 'utf8'),
        fs.writeFile(answersPath, answersCsv, 'utf8'),
      ]);

      this.logger.log(`Exported to ${quizzesPath} and ${answersPath}`);
    } catch (err) {
      this.logger.error('Export failed', err as any);
      throw err;
    }
  }

  // Other quiz-related methods
  async findAllQuizzes(
    query: QueryDto,
  ): Promise<ResponseDto<QuizDto<AnswerDto>>> {
    try {
      const { search, sortBy, sortOrder, page = 1, limit = 10 } = query;
      const skip = (page - 1) * limit;

      const qb = this.quizRepository
        .createQueryBuilder('quiz')
        .leftJoinAndSelect('quiz.sub_subject', 'sub_subject');

      if (search) {
        qb.where('quiz.title ILIKE :search OR quiz.description ILIKE :search', {
          search: `%${search}%`,
        });
      }

      if (sortBy) {
        qb.orderBy(`quiz.${sortBy}`, sortOrder === 'DESC' ? 'DESC' : 'ASC');
      } else {
        qb.orderBy('quiz.created_at', 'DESC');
      }

      qb.skip(skip).take(limit);
      const [quizzes, totalItems] = await qb.getManyAndCount();

      // Batch fetch answers for all quizzes returned in this page
      const quizIds = quizzes.map((q) => q.id);
      this.logger.log(`Fetching answers for quiz IDs: ${quizIds.join(', ')}`);
      let answersList: QuizAnswer[] = [];
      if (quizIds.length > 0) {
        answersList = await this.quizAnswerRepository.find({
          where: { quiz: In(quizIds) } as any,
          relations: ['quiz'] as any,
        });
        this.logger.log(`Fetched ${answersList.length} answers for quizzes`);
      }

      // Group answers by quiz id
      const answersByQuiz = new Map<number, AnswerDto[]>();
      for (const a of answersList) {
        const qid = (a.quiz as any)?.id ?? (a as any).quizId ?? null;
        if (!qid) continue;
        const arr = answersByQuiz.get(qid) ?? [];
        arr.push({
          id: a.id,
          answer_type: a.answer_type,
          answer_text: a.answer_text,
          is_correct: a.is_correct,
          image_url: a.image_url,
        });
        answersByQuiz.set(qid, arr);
      }

      const totalPages = Math.ceil(totalItems / limit);
      const nextPage = page * limit < totalItems ? page + 1 : false;
      const prevPage = page > 1 ? page - 1 : false;

      const response = quizzes.map((q) => ({
        id: q.id,
        sub_subject: q.sub_subject
          ? {
              id: (q.sub_subject as any).id,
              name: (q.sub_subject as any).title,
            }
          : null,
        title: q.title,
        slug: q.slug,
        description: q.description,
        time_limit: q.time_limit,
        score: q.score,
        score_remaining: q.score_remaining,
        score_reward: q.score_reward,
        answers: answersByQuiz.get(q.id) ?? [],
      }));

      if (response.length === 0) {
        return {
          data: [],
          pagination: {
            page,
            limit,
            totalPages,
            totalItems,
            nextPage,
            prevPage,
          },
        };
      }

      return {
        data: response,
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
        this.logger.error('Error in findAllQuizzes:', error.message);
        throw error;
      }
      throw new HttpException(
        'Internal server error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Get all quiz and their answers by sub subject id
  async findAllQuizzesBySubSubjectId(
    subSubjectId: number,
    query: QueryDto,
  ): Promise<ResponseDto<QuizDto<AnswerDto>>> {
    try {
      const { search, sortBy, sortOrder, page = 1, limit = 10 } = query;
      const skip = (page - 1) * limit;

      const qb = this.quizRepository
        .createQueryBuilder('quiz')
        .leftJoinAndSelect('quiz.sub_subject', 'sub_subject')
        .where('sub_subject.id = :subSubjectId', { subSubjectId });

      if (search) {
        qb.where('quiz.title ILIKE :search OR quiz.description ILIKE :search', {
          search: `%${search}%`,
        });
      }

      if (sortBy) {
        qb.orderBy(`quiz.${sortBy}`, sortOrder === 'DESC' ? 'DESC' : 'ASC');
      } else {
        qb.orderBy('quiz.created_at', 'DESC');
      }

      qb.skip(skip).take(limit);
      const [quizzes, totalItems] = await qb.getManyAndCount();

      // Batch fetch answers for all quizzes returned in this page
      const quizIds = quizzes.map((q) => q.id);
      this.logger.log(`Fetching answers for quiz IDs: ${quizIds.join(', ')}`);
      let answersList: QuizAnswer[] = [];
      if (quizIds.length > 0) {
        answersList = await this.quizAnswerRepository.find({
          where: { quiz: In(quizIds) } as any,
          relations: ['quiz'] as any,
        });
        this.logger.log(`Fetched ${answersList.length} answers for quizzes`);
      }

      // Group answers by quiz id
      const answersByQuiz = new Map<number, AnswerDto[]>();
      for (const a of answersList) {
        const qid = (a.quiz as any)?.id ?? (a as any).quizId ?? null;
        if (!qid) continue;
        const arr = answersByQuiz.get(qid) ?? [];
        arr.push({
          id: a.id,
          answer_type: a.answer_type,
          answer_text: a.answer_text,
          is_correct: a.is_correct,
          image_url: a.image_url,
        });
        answersByQuiz.set(qid, arr);
      }

      const totalPages = Math.ceil(totalItems / limit);
      const nextPage = page * limit < totalItems ? page + 1 : false;
      const prevPage = page > 1 ? page - 1 : false;

      const totalTimer = quizzes.reduce(
        (acc, q) => acc + (q.time_limit ?? 0),
        0,
      );

      const response = quizzes.map((q) => ({
        id: q.id,
        sub_subject: q.sub_subject
          ? {
              id: (q.sub_subject as any).id,
              name: (q.sub_subject as any).title,
            }
          : null,
        title: q.title,
        slug: q.slug,
        description: q.description,
        time_limit: q.time_limit,
        score: q.score,
        score_remaining: q.score_remaining,
        score_reward: q.score_reward,
        answers: answersByQuiz.get(q.id) ?? [],
      }));

      if (response.length === 0) {
        return {
          data: [],
          pagination: {
            page,
            limit,
            totalPages,
            totalItems,
            nextPage,
            prevPage,
          },
          time_started: new Date(),
        };
      }

      return {
        data: response,
        pagination: {
          page,
          limit,
          totalItems,
          totalPages,
          nextPage,
          prevPage,
        },
        time_started: new Date(),
        time_completed: new Date(Date.now() + totalTimer * 1000),
      };
    } catch (error) {
      if (error instanceof HttpException) {
        this.logger.error('Error in findAllQuizzes:', error.message);
        throw error;
      }
      throw new HttpException(
        'Internal server error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findQuizById(id: number): Promise<QuizDto<AnswerDto>> {
    const quiz = await this.quizRepository.findOne({
      where: { id } as any,
      relations: ['sub_subject'] as any,
    });
    if (!quiz) {
      throw new HttpException('Quiz not found', HttpStatus.NOT_FOUND);
    }
    const answers = await this.quizAnswerRepository.find({
      where: { quiz: { id: quiz.id } } as any,
      relations: ['quiz'] as any,
    });

    const subSubject = await this.subSubjectRepository.findOne({
      where: { id: (quiz.sub_subject as any)?.id } as any,
    });

    return {
      id: quiz.id,
      sub_subject: {
        id: subSubject ? subSubject.id : null,
        name: subSubject ? subSubject.title : null,
      },
      title: quiz.title,
      slug: quiz.slug,
      description: quiz.description,
      time_limit: quiz.time_limit,
      score: quiz.score,
      score_remaining: quiz.score_remaining,
      score_reward: quiz.score_reward,
      answers: answers.map((a) => ({
        id: a.id,
        answer_type: a.answer_type,
        answer_text: a.answer_text,
        is_correct: a.is_correct,
        image_url: a.image_url,
      })),
    };
  }
}

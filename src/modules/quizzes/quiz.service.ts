import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Quiz, QuizAnswer } from './quiz.entity';
import { Repository, In } from 'typeorm';
import { SubSubject } from '../subjects/sub-subject.entity';
import { promises as fs } from 'fs';
import * as path from 'path';
import { parseLine } from 'src/utils/parseLine';
import {
  AnswerDto,
  QueryDto,
  QuizDto,
  ResponseDto,
} from './quiz.dto';

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
  ) {
    this.logger.log('QuizService initialized');
  }

  // helper: simple CSV parser supporting quoted fields ("," and "" escaping)
  private parseCSV(content: string): Record<string, string>[] {
    const lines = content.split(/\r?\n/).filter((l) => l.trim() !== '');
    if (lines.length === 0) return [];
    const headerLine = lines.shift()!;
    // const parseLine = (line: string) => {
    //   const fields: string[] = [];
    //   let cur = '';
    //   let inQuotes = false;
    //   for (let i = 0; i < line.length; i++) {
    //     const ch = line[i];
    //     if (ch === '"' && line[i + 1] === '"') {
    //       cur += '"';
    //       i++;
    //       continue;
    //     }
    //     if (ch === '"') {
    //       inQuotes = !inQuotes;
    //       continue;
    //     }
    //     if (ch === ',' && !inQuotes) {
    //       fields.push(cur);
    //       cur = '';
    //       continue;
    //     }
    //     cur += ch;
    //   }
    //   fields.push(cur);
    //   return fields.map((f) => f.trim());
    // };
    const headers = parseLine(headerLine);
    return lines.map((ln) => {
      const vals = parseLine(ln);
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => {
        obj[h] = vals[idx] ?? '';
      });
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
  async importQuizzesFromCSV(filePath: string): Promise<void> {
    try {
      // accept either folder or a csv file path (use parent folder)
      let dir = filePath;
      if (filePath.endsWith('.csv')) {
        dir = path.dirname(filePath);
      }

      const quizzesPath = path.join(dir, 'quizzes.csv');
      const answersPath = path.join(dir, 'quiz_answers.csv');

      this.logger.log(`Import: reading ${quizzesPath} and ${answersPath}`);

      const [quizzesContent, answersContent] = await Promise.all([
        fs.readFile(quizzesPath, 'utf8'),
        fs.readFile(answersPath, 'utf8'),
      ]);

      const quizRows = this.parseCSV(quizzesContent);
      const answerRows = this.parseCSV(answersContent);

      // Map to keep slug/id -> saved Quiz
      const quizMap = new Map<string | number, Quiz>();

      // Process quizzes: expect sub_subject column to contain SubSubject id (number)
      for (const row of quizRows) {
        // columns expected: sub_subject, title, slug, description
        const subSubjectVal = row['sub_subject'] ?? row['subSubject'] ?? '';
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

        const saved = await this.quizRepository.save(quiz);

        quizMap.set(String(saved.id), saved);
        quizMap.set(saved.slug, saved);
      }

      // Process answers: columns expected: quiz, answer_text, is_correct, image_url?
      for (const row of answerRows) {
        const quizVal = row['quiz'] ?? row['quiz_id'] ?? row['quizSlug'] ?? '';
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

        // find saved quiz by id or slug; if not in map, try DB lookup
        let quizEntity: Quiz | undefined = quizMap.get(quizVal);
        if (!quizEntity) {
          const maybeId = Number(quizVal);
          if (!Number.isNaN(maybeId) && maybeId > 0) {
            quizEntity = await this.quizRepository
              .findOne({ where: { id: maybeId } as any })
              .catch(() => null);
          }
          if (!quizEntity) {
            quizEntity = await this.quizRepository
              .findOne({ where: { slug: quizVal } as any })
              .catch(() => null);
          }
          if (quizEntity) {
            quizMap.set(String(quizEntity.id), quizEntity);
            quizMap.set(quizEntity.slug, quizEntity);
          }
        }

        if (!quizEntity) {
          this.logger.warn(
            `Quiz not found for answer row: ${JSON.stringify(row)} - skipping`,
          );
          continue;
        }

        const is_correct = ['1', 'true', 'yes', 'y'].includes(is_correct_raw);

        const answer = this.quizAnswerRepository.create({
          quiz: quizEntity,
          answer_text,
          is_correct,
          image_url: image_url === '' ? null : image_url,
        } as any);

        await this.quizAnswerRepository.save(answer);
      }

      this.logger.log('Import completed successfully');
    } catch (err) {
      this.logger.error('Import failed', err as any);
      throw err;
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
      let answersList: QuizAnswer[] = [];
      if (quizIds.length > 0) {
        answersList = await this.quizAnswerRepository.find({
          where: { quiz: In(quizIds) } as any,
        });
      }

      // Group answers by quiz id
      const answersByQuiz = new Map<number, AnswerDto[]>();
      for (const a of answersList) {
        const qid = (a.quiz as any)?.id ?? (a as any).quizId ?? null;
        if (!qid) continue;
        const arr = answersByQuiz.get(qid) ?? [];
        arr.push({
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
        sub_subject_id: q.sub_subject ? (q.sub_subject as any).id : null,
        title: q.title,
        slug: q.slug,
        description: q.description,
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
    });

    return {
      id: quiz.id,
      sub_subject_id: quiz.sub_subject ? (quiz.sub_subject as any).id : null,
      title: quiz.title,
      slug: quiz.slug,
      description: quiz.description,
      answers: answers.map((a) => ({
        id: a.id,
        answer_text: a.answer_text,
        is_correct: a.is_correct,
        image_url: a.image_url,
      })),
    };
  }
}

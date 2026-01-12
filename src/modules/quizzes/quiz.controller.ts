import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  Query,
  Req,
  UploadedFile,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import * as fs from 'fs';
import * as path from 'path';
import { QuizService } from './quiz.service';
import { QueryDto } from './quiz.dto';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { UploadedFiles } from '@nestjs/common';
import * as unzipper from 'unzipper';
import { JwtAuthGuard } from '../auth/auth.guard';

@Controller('quizzes')
export class QuizController {
  // Implement quiz-related endpoints here
  constructor(private readonly quizService: QuizService) {}

  @ApiOperation({ summary: 'Import quizzes CSV (quizzes.csv) - upload a single CSV file' })
  @ApiResponse({ status: 201, description: 'Quizzes imported successfully.' })
  @ApiResponse({ status: 400, description: 'Bad Request.' })
  @ApiResponse({ status: 500, description: 'Internal Server Error.' })
  @Post('import/quizzes')
  @UseInterceptors(require('@nestjs/platform-express').FileInterceptor('file'))
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  async importQuizzesCSV(@Req() req: any, @UploadedFile() file?: Express.Multer.File) {
    const userId = req.user?.id;
    if (!userId) throw new BadRequestException('User ID not found in request');

    if (!file) throw new BadRequestException('File is required');
    const original = file.originalname || '';
    console.log('Uploaded file original name:', original);
    const lower = original.toLowerCase();
    if (!lower.endsWith('.csv')) throw new BadRequestException('Only CSV files are accepted');

    const tmpDirBase = path.join(process.cwd(), process.env.TMP_DIR || 'tmp');
    fs.mkdirSync(tmpDirBase, { recursive: true });
    const folder = path.join(tmpDirBase, `import_quizzes_${Date.now()}`);
    fs.mkdirSync(folder, { recursive: true });

    const outPath = path.join(folder, 'quizzes.csv');
    if ((file as any).buffer) fs.writeFileSync(outPath, file.buffer);
    else if ((file as any).path) fs.copyFileSync((file as any).path, outPath);

    await this.quizService.importQuizzesFromCSV(folder, userId);
    return { message: 'Import completed', path: folder };
  }

  @ApiOperation({ summary: 'Import quiz answers CSV (quiz_answers.csv) - upload a single CSV file' })
  @ApiResponse({ status: 201, description: 'Quiz answers imported successfully.' })
  @ApiResponse({ status: 400, description: 'Bad Request.' })
  @ApiResponse({ status: 500, description: 'Internal Server Error.' })
  @Post('import/answers')
  @UseInterceptors(require('@nestjs/platform-express').FileInterceptor('file'))
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  async importQuizAnswersCSV(@Req() req: any, @UploadedFile() file?: Express.Multer.File) {
    const userId = req.user?.id;
    if (!userId) throw new BadRequestException('User ID not found in request');

    if (!file) throw new BadRequestException('File is required');
    const original = file.originalname || '';
    const lower = original.toLowerCase();
    if (!lower.endsWith('.csv')) throw new BadRequestException('Only CSV files are accepted');

    const tmpDirBase = path.join(process.cwd(), process.env.TMP_DIR || 'tmp');
    fs.mkdirSync(tmpDirBase, { recursive: true });
    const folder = path.join(tmpDirBase, `import_quizzes_${Date.now()}`);
    fs.mkdirSync(folder, { recursive: true });

    const outPath = path.join(folder, 'quiz_answers.csv');
    if ((file as any).buffer) fs.writeFileSync(outPath, file.buffer);
    else if ((file as any).path) fs.copyFileSync((file as any).path, outPath);

    await this.quizService.importQuizzesFromCSV(folder, userId);
    return { message: 'Import completed', path: folder };
  }

  @ApiOperation({ summary: 'Export quizzes and answers to CSV files' })
  @ApiResponse({ status: 200, description: 'Quizzes exported successfully.' })
  @ApiResponse({ status: 500, description: 'Internal Server Error.' })
  @Get('export/csv')
  @HttpCode(HttpStatus.OK)
  async exportQuizzesToCSV(@Query('path') destPath?: string) {
    const target = destPath || './exports';
    await this.quizService.exportQuizzesToCSV(target);
    return { message: 'Export completed', path: target };
  }

  @ApiOperation({ summary: 'Get quizzes' })
  @ApiResponse({ status: 200, description: 'Quizzes retrieved successfully.' })
  @ApiResponse({ status: 500, description: 'Internal Server Error.' })
  @Get()
  @HttpCode(HttpStatus.OK)
  async getQuizzes(@Query() query: QueryDto) {
    return this.quizService.findAllQuizzes(query);
  }

  @ApiOperation({ summary: 'Get quizzes by SubSubject ID' })
  @ApiResponse({ status: 200, description: 'Quizzes retrieved successfully.' })
  @ApiResponse({ status: 500, description: 'Internal Server Error.' })
  @Get('sub-subject/:subSubjectId')
  @HttpCode(HttpStatus.OK)
  async getQuizzesBySubSubjectId(
    @Param('subSubjectId') subSubjectId: number,
    @Query() query: QueryDto,
  ) {
    return this.quizService.findAllQuizzesBySubSubjectId(subSubjectId, query);
  }

  @ApiOperation({ summary: 'Get quiz by ID' })
  @ApiResponse({ status: 200, description: 'Quiz retrieved successfully.' })
  @ApiResponse({ status: 404, description: 'Quiz not found.' })
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getQuizById(@Param('id') id: number) {
    return this.quizService.findQuizById(id);
  }
}

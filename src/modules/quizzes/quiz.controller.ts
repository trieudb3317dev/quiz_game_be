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
} from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import * as fs from 'fs';
import * as path from 'path';
import { QuizService } from './quiz.service';
import { QueryDto } from './quiz.dto';

@Controller('quizzes')
export class QuizController {
  // Implement quiz-related endpoints here
  constructor(private readonly quizService: QuizService) {}

  @ApiOperation({ summary: 'Import quizzes from CSV files (quizzes.csv + quiz_answers.csv)' })
  @ApiResponse({ status: 201, description: 'Quizzes imported successfully.' })
  @ApiResponse({ status: 400, description: 'Bad Request.' })
  @ApiResponse({ status: 500, description: 'Internal Server Error.' })
  @Post('import/csv')
  @HttpCode(HttpStatus.CREATED)
  async importQuizzesFromCSV(@Req() req: any, @UploadedFile() file: Express.Multer.File) {
    // Accept either disk-storage (file.path) or memory buffer
    let filePathToPass: string | undefined = (file as any).path;

    if (!filePathToPass && (file as any).buffer) {
      const tmpDir = path.join(process.cwd(), process.env.TMP_DIR || 'tmp');
      fs.mkdirSync(tmpDir, { recursive: true });
      const filename = `import_quizzes_${Date.now()}_${(file.originalname || 'upload').replace(/\s+/g, '_')}`;
      const fp = path.join(tmpDir, filename);
      fs.writeFileSync(fp, (file as any).buffer);
      filePathToPass = fp;
    }

    if (!filePathToPass) {
      return { message: 'No file provided' };
    }

    await this.quizService.importQuizzesFromCSV(filePathToPass);
    return { message: 'Import started/completed' };
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

  @ApiOperation({ summary: 'Get quiz by ID' })
  @ApiResponse({ status: 200, description: 'Quiz retrieved successfully.' })
  @ApiResponse({ status: 404, description: 'Quiz not found.' })
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getQuizById(@Param('id') id: number) {
    return this.quizService.findQuizById(id);
  }
}
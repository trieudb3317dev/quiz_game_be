import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseGuards,
} from '@nestjs/common';
import { SubjectService } from './subject.service';
import { UseInterceptors, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import * as fs from 'fs';
import * as path from 'path';
import { QueryDto } from './subject.dto';
import { JwtAdminAuthGuard } from '../admin/admin.guard';

@Controller('subjects')
export class SubjectController {
  // Implement subject-related endpoints here
  constructor(private readonly subjectService: SubjectService) {}

  // Endpoint to import subjects from CSV file

  @ApiOperation({ summary: 'Import subjects from CSV file' })
  @ApiResponse({ status: 201, description: 'Subjects imported successfully.' })
  @ApiResponse({ status: 400, description: 'Bad Request.' })
  @ApiResponse({ status: 500, description: 'Internal Server Error.' })
  @Post('import/csv')
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAdminAuthGuard)
  async importSubjectsFromCSV(
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    // If multer stores file on disk, file.path is available
    let filePathToPass: string | undefined = (file as any).path;

    // If multer used memory storage, write buffer to tmp and pass that path
    if (!filePathToPass && (file as any).buffer) {
      const tmpDir = path.join(process.cwd(), process.env.TMP_DIR || 'tmp');
      fs.mkdirSync(tmpDir, { recursive: true });
      const filename = `import_${Date.now()}_${(file.originalname || 'upload').replace(/\s+/g, '_')}`;
      const fp = path.join(tmpDir, filename);
      fs.writeFileSync(fp, (file as any).buffer);
      filePathToPass = fp;
    }
    const userId = req.user ? req.user.id : null;
    return this.subjectService.importSubjectsFromCSV(userId, filePathToPass!);
  }

  @ApiOperation({ summary: 'Export subjects to CSV file' })
  @ApiResponse({ status: 200, description: 'Subjects exported successfully.' })
  @ApiResponse({ status: 500, description: 'Internal Server Error.' })
  @Get('export/csv')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAdminAuthGuard)
  async exportSubjectsToCSV() {
    return this.subjectService.exportSubjectsToCSV();
  }

  @ApiOperation({ summary: 'Get subjects' })
  @ApiResponse({ status: 200, description: 'Subjects retrieved successfully.' })
  @ApiResponse({ status: 500, description: 'Internal Server Error.' })
  @Get()
  @HttpCode(HttpStatus.OK)
  async getSubjects(@Query() query: QueryDto) {
    return this.subjectService.findAllSubjects(query);
  }

  @ApiOperation({ summary: 'Get subject by ID' })
  @ApiResponse({ status: 200, description: 'Subject retrieved successfully.' })
  @ApiResponse({ status: 404, description: 'Subject not found.' })
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getSubjectById(@Param('id') id: number) {
    return this.subjectService.findSubjectById(id);
  }

  @ApiOperation({ summary: 'Update subjects' })
  @ApiResponse({ status: 200, description: 'Subjects updated successfully.' })
  @ApiResponse({ status: 500, description: 'Internal Server Error.' })
  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAdminAuthGuard)
  async updateAllSubjects(
    @Param('id') id: number,
    @Body() body: any,
    @Req() req: any,
  ) {
    const adminId = req.user ? req.user.id : null;
    return this.subjectService.updateSubject(adminId, id, body);
  }

  @ApiOperation({ summary: 'Delete subject by ID' })
  @ApiResponse({ status: 200, description: 'Subject deleted successfully.' })
  @ApiResponse({ status: 500, description: 'Internal Server Error.' })
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAdminAuthGuard)
  async deleteSubjectById(@Param('id') id: number, @Req() req: any) {
    const adminId = req.user ? req.user.id : null;
    return this.subjectService.deleteSubject(id, adminId);
  }

  // Endpoint to get subjects along with their sub-subjects

  @ApiOperation({ summary: 'Import sub-subjects from CSV file' })
  @ApiResponse({
    status: 201,
    description: 'Sub-subjects imported successfully.',
  })
  @ApiResponse({ status: 400, description: 'Bad Request.' })
  @ApiResponse({ status: 500, description: 'Internal Server Error.' })
  @Post('sub-subjects/import/csv')
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAdminAuthGuard)
  async importSubSubjectsFromCSV(
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    let filePathToPass: string | undefined = (file as any).path;

    if (!filePathToPass && (file as any).buffer) {
      const tmpDir = path.join(process.cwd(), process.env.TMP_DIR || 'tmp');
      fs.mkdirSync(tmpDir, { recursive: true });
      const filename = `import_sub_${Date.now()}_${(file.originalname || 'upload').replace(/\s+/g, '_')}`;
      const fp = path.join(tmpDir, filename);
      fs.writeFileSync(fp, (file as any).buffer);
      filePathToPass = fp;
    }
    const userId = req.user ? req.user.id : null;
    return this.subjectService.importSubSubjectsFromCSV(
      userId,
      filePathToPass!,
    );
  }

  @ApiOperation({ summary: 'Export sub-subjects to CSV file' })
  @ApiResponse({
    status: 200,
    description: 'Sub-subjects exported successfully.',
  })
  @ApiResponse({ status: 500, description: 'Internal Server Error.' })
  @Get('sub-subjects/export/csv')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAdminAuthGuard)
  async exportSubSubjectsToCSV() {
    return this.subjectService.exportSubSubjectsToCSV();
  }

  @ApiOperation({ summary: 'Get sub-subjects' })
  @ApiResponse({
    status: 200,
    description: 'Sub-subjects retrieved successfully.',
  })
  @ApiResponse({ status: 500, description: 'Internal Server Error.' })
  @Get('/:subjectId/sub-subjects/all')
  @HttpCode(HttpStatus.OK)
  async getSubSubjects(
    @Query() query: QueryDto,
    @Param('subjectId') subjectId: number,
  ) {
    return this.subjectService.findAllSubSubjects(query, subjectId);
  }

  @ApiOperation({ summary: 'Get sub-subject by ID' })
  @ApiResponse({
    status: 200,
    description: 'Sub-subject retrieved successfully.',
  })
  @ApiResponse({ status: 404, description: 'Sub-subject not found.' })
  @Get('sub-subjects/:id')
  @HttpCode(HttpStatus.OK)
  async getSubSubjectById(@Param('id') id: number) {
    return this.subjectService.findSubSubjectById(id);
  }

  @ApiOperation({ summary: 'Update sub-subject' })
  @ApiResponse({
    status: 200,
    description: 'Sub-subject updated successfully.',
  })
  @ApiResponse({ status: 500, description: 'Internal Server Error.' })
  @Put('sub-subjects/:id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAdminAuthGuard)
  async updateSubSubject(
    @Param('id') id: number,
    @Body() body: any,
    @Req() req: any,
  ) {
    const adminId = req.user ? req.user.id : null;
    return this.subjectService.updateSubSubject(adminId, id, body);
  }

  @ApiOperation({ summary: 'Delete sub-subject by ID' })
  @ApiResponse({
    status: 200,
    description: 'Sub-subject deleted successfully.',
  })
  @ApiResponse({ status: 500, description: 'Internal Server Error.' })
  @Delete('sub-subjects/:id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAdminAuthGuard)
  async deleteSubSubjectById(@Param('id') id: number, @Req() req: any) {
    const adminId = req.user ? req.user.id : null;
    return this.subjectService.deleteSubSubject(id, adminId);
  }
}

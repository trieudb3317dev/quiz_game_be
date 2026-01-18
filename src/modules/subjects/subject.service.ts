import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FieldType, Subject } from './subject.entity';
import { Repository } from 'typeorm';
import { SubSubject } from './sub-subject.entity';
import { Admin } from '../admin/admin.entity';
import * as path from 'path';
import * as fs from 'fs';
import { parseLine } from 'src/utils/parseLine';
import { slugify } from 'src/utils/slugify';
import {
  QueryDto,
  ResponseDto,
  SubjectResponseDto,
  SubSubjectResponseDto,
} from './subject.dto';

@Injectable()
export class SubjectService {
  // Implement subject-related business logic here
  private readonly logger = new Logger(SubjectService.name);
  constructor(
    @InjectRepository(Subject)
    private readonly subjectRepository: Repository<Subject>,
    @InjectRepository(SubSubject)
    private readonly subSubjectRepository: Repository<SubSubject>,
    @InjectRepository(Admin)
    private readonly adminRepository: Repository<Admin>,
  ) {
    this.logger.log('SubjectService initialized');
  }

  // Logic for subjects import/export, other subject-related methods

  async importSubjectsFromCSV(
    userId: number,
    filePath: string,
  ): Promise<{ message: string; summary?: any; filePath?: string }> {
    try {
      const isAdmin = await this.adminRepository.findOne({
        where: { id: userId },
      });
      if (!isAdmin) {
        throw new HttpException(
          'Unauthorized: Only admins can import subjects',
          HttpStatus.FORBIDDEN,
        );
      }
      // Use the filePath parameter as needed for importing subjects
      let resolvedPath: string | null = null;

      if (filePath) {
        resolvedPath = path.isAbsolute(filePath)
          ? filePath
          : path.resolve(process.cwd(), filePath);

        if (!fs.existsSync(resolvedPath)) {
          throw new HttpException(
            'File not found at the specified path',
            HttpStatus.BAD_REQUEST,
          );
        }
      } else {
        throw new HttpException(
          'File path must be provided',
          HttpStatus.BAD_REQUEST,
        );
      }

      const content = fs.readFileSync(resolvedPath, 'utf-8');
      this.logger.log(
        `Importing subjects from CSV file at path: ${resolvedPath}`,
      );
      // Parse CSV content and import subjects logic goes here
      const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length < 2) {
        throw new HttpException('CSV has no data rows', HttpStatus.BAD_REQUEST);
      }

      const rawHeaders = parseLine(lines[0]).map((h) => h.trim());
      const headers = rawHeaders.map((h) => h.toLowerCase());
      const rows = lines.slice(1).map((l) => parseLine(l));

      const summary = {
        imported: 0,
        skipped: 0,
        errors: 0,
        errorsDetails: [],
      };

      for (const row of rows) {
        try {
          const obj: Record<string, string> = {};
          headers.forEach((h, idx) => {
            obj[h] = row[idx] ?? '';
          });

          const name = (obj['name'] || obj['title'] || '').trim();
          if (!name) {
            summary.skipped++;
            continue;
          }

          const slugFromCsv = (obj['slug'] || '').trim();
          const slug = slugFromCsv || slugify(name);
          const image_url =
            (obj['image_url'] || obj['image'] || '').trim() || null;
          const description = (obj['description'] || '').trim() || null;
          const field_type = (obj['field_type'] || 'null').trim() || 'null';

          // avoid duplicates: check existing by name or slug
          const exists = await this.subjectRepository.findOne({
            where: [
              { title: name, is_active: false },
              { slug: slug, is_active: false },
            ],
          });
          if (exists) {
            summary.skipped++;
            continue;
          }

          const newCategory = this.subjectRepository.create({
            created_by: isAdmin,
            field_type: FieldType[field_type.toUpperCase()] || FieldType.NULL,
            title: name,
            slug,
            image_url,
            description,
          });
          await this.subjectRepository.save(newCategory);
          summary.imported++;
        } catch (error) {
          summary.errors++;
          summary.errorsDetails.push(String(error?.message || error));
          this.logger?.error?.('Import subject row failed', error);
          continue;
        }
      }

      return {
        message: 'Import subjects completed successfully',
        filePath: resolvedPath,
        summary,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        this.logger.error(`Import subjects failed: ${error.message}`);
        throw error;
      }
      throw new HttpException(
        'Failed to import subjects',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async exportSubjectsToCSV(): Promise<{ message: string; filePath?: string }> {
    try {
      const subjects = await this.subjectRepository.find();
      // Implement CSV export logic here
      const exportDirEnv = process.env.EXPORT_DIR;
      let exportDir: string = exportDirEnv || './exports';
      if (!fs.existsSync(exportDir)) {
        fs.mkdirSync(exportDir, { recursive: true });
      }
      const filePath = path.join(exportDir, 'subjects.csv');
      const csvData = subjects
        .map((subject) => {
          return `${subject.id},"${subject.field_type}","${subject.title}","${subject.slug}","${subject.image_url}","${subject.description}",${subject.is_active},${subject.created_at.toISOString()}`;
        })
        .join('\n');
      const csvHeader =
        'id,field_type,title,slug,image_url,description,is_active,created_at\n';
      fs.writeFileSync(filePath, csvHeader + csvData);
      return { message: 'Subjects exported successfully', filePath };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        `Internal server error: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findAllSubjects(
    query: QueryDto,
  ): Promise<ResponseDto<SubjectResponseDto>> {
    try {
      const {
        search,
        sortBy = 'created_at',
        sortOrder = 'DESC',
        page = 1,
        limit = 10,
      } = query;
      const skip = (page - 1) * limit;
      const qb = this.subjectRepository
        .createQueryBuilder('subject')
        .where('subject.is_active = false')
        .leftJoin('subject.created_by', 'admin')
        .select([
          'subject.id',
          'subject.title',
          'subject.slug',
          'subject.image_url',
          'subject.description',
          'subject.field_type',
          'subject.created_at',
          'admin.username',
          'admin.email',
          'admin.role',
        ]);
      // Apply search filter

      if (search) {
        qb.where(`subject.title ILIKE :search`, { search: `%${search}%` });
      }

      // Get total count for pagination`
      const totalItems = await qb.getCount();
      const totalPages = Math.ceil(totalItems / limit);

      // Apply sorting
      qb.orderBy(`subject.${sortBy}`, sortOrder as 'ASC' | 'DESC');

      // Apply pagination
      qb.skip(skip).take(limit);

      const subjects = await qb.getMany();

      // Map to SubjectResponseDto with subCount\
      const data: SubjectResponseDto[] = await Promise.all(
        subjects.map(async (subject) => {
          const subCount = await this.subSubjectRepository.count({
            where: { subject: { id: subject.id }, is_active: false },
          });
          return {
            id: subject.id,
            title: subject.title,
            slug: subject.slug,
            image_url: subject.image_url,
            description: subject.description,
            field_type: subject.field_type,
            subCount,
            created_at: subject.created_at,
            created_by: {
              username: subject.created_by?.username,
              email: subject.created_by?.email,
              role: subject.created_by?.role,
            },
          };
        }),
      );

      if (data.length === 0) {
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

      return {
        data,
        pagination: {
          page,
          limit,
          totalItems,
          totalPages,
          nextPage: page < totalPages ? page + 1 : false,
          prevPage: page > 1 ? page - 1 : false,
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to retrieve subjects',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findSubjectById(id: number): Promise<SubjectResponseDto> {
    try {
      const subject = await this.subjectRepository
        .createQueryBuilder('subject')
        .where('subject.id = :id', { id })
        .andWhere('subject.is_active = false')
        .select([
          'subject.id',
          'subject.title',
          'subject.slug',
          'subject.image_url',
          'subject.description',
        ])
        .getOne();

      const sudCount = await this.subSubjectRepository.count({
        where: { subject: { id: id }, is_active: false },
      });

      if (!subject) {
        throw new HttpException('Subject not found', HttpStatus.NOT_FOUND);
      }
      return {
        id: subject.id,
        title: subject.title,
        slug: subject.slug,
        image_url: subject.image_url,
        description: subject.description,
        subCount: sudCount, // You can implement subCount logic if needed
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to retrieve subject',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async updateSubject(
    userId: number,
    id: number,
    updateData: Partial<Subject>,
  ): Promise<{ message: string } | SubjectResponseDto> {
    try {
      const isAdmin = await this.adminRepository.findOne({
        where: { id: userId },
      });

      if (!isAdmin) {
        throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
      }

      const subject = await this.subjectRepository.findOne({
        where: { id, is_active: false },
        relations: ['created_by'],
      });

      if (!subject) {
        throw new HttpException('Subject not found', HttpStatus.NOT_FOUND);
      }

      if (isAdmin.username !== subject.created_by.username) {
        throw new HttpException(
          'Only the creator can update this subject',
          HttpStatus.FORBIDDEN,
        );
      }

      await this.subjectRepository.update(id, {
        ...updateData,
        created_by: isAdmin,
      });

      return {
        message: 'Subject updated successfully',
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to update subject',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async deleteSubject(
    id: number,
    userId: number,
  ): Promise<{ message: string }> {
    try {
      const isAdmin = await this.adminRepository.findOne({
        where: { id: userId },
      });

      if (!isAdmin) {
        throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
      }

      const subject = await this.subjectRepository.findOne({
        where: { id, is_active: false },
      });

      if (!subject) {
        throw new HttpException('Subject not found', HttpStatus.NOT_FOUND);
      }

      if (isAdmin.username !== subject.created_by.username) {
        throw new HttpException(
          'Only the creator can delete this subject',
          HttpStatus.FORBIDDEN,
        );
      }

      await this.subjectRepository.update(id, { is_active: true });
      return { message: 'Subject deleted successfully' };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to delete subject',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Logic for sub-subjects import/export, other sub-subject-related methods

  async importSubSubjectsFromCSV(
    userId: number,
    filePath: string,
  ): Promise<{ message: string; summary?: any; filePath?: string }> {
    try {
      const isAdmin = await this.adminRepository.findOne({
        where: { id: userId },
      });
      if (!isAdmin) {
        throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
      }
      let resolvedPath: string | null = null;

      if (filePath) {
        resolvedPath = path.isAbsolute(filePath)
          ? filePath
          : path.resolve(process.cwd(), filePath);
        if (!fs.existsSync(resolvedPath)) {
          throw new HttpException(
            'File not found at the specified path',
            HttpStatus.BAD_REQUEST,
          );
        }
      } else {
        throw new HttpException(
          'File path must be provided',
          HttpStatus.BAD_REQUEST,
        );
      }

      const content = fs.readFileSync(resolvedPath, 'utf-8');
      this.logger.log(
        `Importing sub-subjects from CSV file at path: ${resolvedPath}`,
      );
      // Parse CSV content and import sub-subjects logic goes here
      const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length < 2) {
        throw new HttpException('CSV has no data rows', HttpStatus.BAD_REQUEST);
      }
      const rawHeaders = parseLine(lines[0]).map((h) => h.trim());
      const headers = rawHeaders.map((h) => h.toLowerCase());
      const rows = lines.slice(1).map((l) => parseLine(l));

      const summary = {
        imported: 0,
        skipped: 0,
        errors: 0,
        errorsDetails: [],
      };

      for (const row of rows) {
        try {
          const obj: Record<string, string> = {};
          headers.forEach((h, idx) => {
            obj[h] = row[idx] ?? '';
          });
          const name = (obj['name'] || obj['title'] || '').trim();
          if (!name) {
            summary.skipped++;
            continue;
          }
          const subjectIdStr = (obj['subject_id'] || '').trim();
          const subjectId = parseInt(subjectIdStr, 10);
          if (isNaN(subjectId)) {
            summary.skipped++;
            continue;
          }

          const slugFromCsv = (obj['slug'] || '').trim();
          const slug = slugFromCsv || slugify(name);
          const image_url =
            (obj['image_url'] || obj['image'] || '').trim() || null;
          const description = (obj['description'] || '').trim() || null;

          const parentSubject = await this.subjectRepository.findOne({
            where: { id: subjectId, is_active: false },
          });

          if (!parentSubject) {
            summary.skipped++;
            continue;
          }

          // avoid duplicates: check existing by name or slug
          const exists = await this.subSubjectRepository.findOne({
            where: [
              { title: name, is_active: true },
              { slug: slug, is_active: true },
            ],
          });

          if (exists) {
            summary.skipped++;
            continue;
          }

          const newSubSubject = this.subSubjectRepository.create({
            created_by: isAdmin,
            subject: parentSubject,
            title: name,
            slug,
            image_url,
            description,
          });
          await this.subSubjectRepository.save(newSubSubject);
          summary.imported++;
        } catch (error) {
          summary.errors++;
          summary.errorsDetails.push(String(error?.message || error));
          this.logger?.error?.('Import sub-subject row failed', error);
          continue;
        }
      }

      return {
        message: 'Import sub-subjects completed successfully',
        filePath: resolvedPath,
        summary,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        this.logger.error(`Import sub-subjects failed: ${error.message}`);
        return error;
      }
      throw new HttpException(
        'Failed to import sub-subjects',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async exportSubSubjectsToCSV(): Promise<{
    message: string;
    filePath?: string;
  }> {
    try {
      const subSubjects = await this.subSubjectRepository.find({
        relations: ['subject'],
      });
      // Implement CSV export logic here
      const exportDirEnv = process.env.EXPORT_DIR;
      let exportDir: string = exportDirEnv || './exports';
      if (!fs.existsSync(exportDir)) {
        fs.mkdirSync(exportDir, { recursive: true });
      }
      const filePath = path.join(exportDir, 'sub_subjects.csv');
      const csvData = subSubjects
        .map((subSubject) => {
          const subjectId = subSubject.subject ? subSubject.subject.id : '';
          return `${subSubject.id},"${subjectId}","${subSubject.title}","${subSubject.slug}","${subSubject.image_url}","${subSubject.description}",${subSubject.is_active},${subSubject.created_at.toISOString()}`;
        })
        .join('\n');

      const csvHeader =
        'id,subject_id,title,slug,image_url,description,is_active,created_at\n';
      fs.writeFileSync(filePath, csvHeader + csvData);
      return { message: 'Sub-subjects exported successfully', filePath };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to export sub-subjects',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findAllSubSubjects(
    query: QueryDto,
    subjectId: number,
  ): Promise<ResponseDto<SubSubjectResponseDto>> {
    try {
      const {
        search,
        sortBy = 'created_at',
        sortOrder = 'DESC',
        limit = 10,
        page = 1,
      } = query;
      const skip = (page - 1) * limit;
      const qb = this.subSubjectRepository
        .createQueryBuilder('sub_subject')
        .where('sub_subject.is_active = false')
        .leftJoin('sub_subject.subject', 'subj')
        .leftJoin('sub_subject.created_by', 'admin')
        .andWhere('subj.id = :subjectId', { subjectId })
        .select([
          'sub_subject.id',
          'sub_subject.title',
          'sub_subject.slug',
          'sub_subject.image_url',
          'sub_subject.description',
          'sub_subject.created_at',
          'sub_subject.is_active',
          'subj.id',
          'subj.title',
          'subj.slug',
          'admin.username',
          'admin.email',
          'admin.role',
        ]);

      if (search) {
        qb.where('sub_subject.title ILIKE :search', { search: `%${search}%` });
      }

      // Get total count for pagination
      const totalItems = await qb.getCount();
      const totalPages = Math.ceil(totalItems / limit);
      const nextPage = page < totalPages ? page + 1 : false;
      const prevPage = page > 1 ? page - 1 : false;
      // Apply sorting
      qb.orderBy(`sub_subject.${sortBy}`, sortOrder as 'ASC' | 'DESC');

      // Apply pagination
      qb.skip(skip).take(limit);

      const subSubjects = await qb.getMany();

      // Map to SubSubjectResponseDto with quizCount

      const data: SubSubjectResponseDto[] = await Promise.all(
        subSubjects.map(async (subSubject) => {
          const quizCount = 0; // Implement quizCount logic if needed
          return {
            id: subSubject.id,
            subject_id: subSubject.subject ? subSubject.subject.id : null,
            title: subSubject.title,
            slug: subSubject.slug,
            image_url: subSubject.image_url,
            description: subSubject.description,
            quizCount,
            created_at: subSubject.subject
              ? subSubject.subject.created_at
              : null,
            subject: {
              title: subSubject.subject ? subSubject.subject.title : null,
              slug: subSubject.subject ? subSubject.subject.slug : null,
            },
            created_by: {
              username: subSubject.created_by?.username,
              email: subSubject.created_by?.email,
              role: subSubject.created_by?.role,
            },
          };
        }),
      );

      if (data.length === 0) {
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

      return {
        data,
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
        this.logger.log(`Error in findAllSubSubjects: ${error.message}`);
        throw error;
      }
      this.logger.log(`Error in findAllSubSubjects: ${error.message}`);
      throw new HttpException(
        `Failed to retrieve sub-subjects: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findSubSubjectById(id: number): Promise<any> {
    try {
      const subSubject = await this.subSubjectRepository
        .createQueryBuilder('sub_subject')
        .leftJoin('sub_subject.subject', 'subject')
        .leftJoin('sub_subject.created_by', 'admin')
        .where('sub_subject.id = :id', { id })
        .andWhere('sub_subject.is_active = false')
        .select([
          'sub_subject.id',
          'sub_subject.title',
          'sub_subject.slug',
          'sub_subject.image_url',
          'sub_subject.description',
          'subject.id',
          'subject.title',
          'admin.username',
          'admin.email',
          'admin.role',
        ])
        .getOne();

      if (!subSubject) {
        throw new HttpException('Sub-subject not found', HttpStatus.NOT_FOUND);
      }

      const quizCount = 0; // Implement quizCount logic if needed
      return {
        id: subSubject.id,
        subject_id: subSubject.subject ? subSubject.subject.id : null,
        title: subSubject.title,
        slug: subSubject.slug,
        image_url: subSubject.image_url,
        description: subSubject.description,
        quizCount,
        subject: {
          id: subSubject.subject ? subSubject.subject.id : null,
          title: subSubject.subject ? subSubject.subject.title : null,
        },
        created_by: {
          username: subSubject.created_by?.username,
          email: subSubject.created_by?.email,
          role: subSubject.created_by?.role,
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to retrieve sub-subject',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async updateSubSubject(
    userId: number,
    id: number,
    updateData: Partial<SubSubject>,
  ): Promise<{ message: string }> {
    try {
      const isAdmin = await this.adminRepository.findOne({
        where: { id: userId },
      });

      if (!isAdmin) {
        throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
      }

      const subSubject = await this.subSubjectRepository.findOne({
        where: { id, is_active: false },
        relations: ['created_by'],
      });

      if (!subSubject) {
        throw new HttpException('Sub-subject not found', HttpStatus.NOT_FOUND);
      }

      if (isAdmin.username !== subSubject.created_by.username) {
        throw new HttpException(
          'Only the creator can update this sub-subject',
          HttpStatus.FORBIDDEN,
        );
      }

      await this.subSubjectRepository.update(id, {
        ...updateData,
        created_by: isAdmin,
      });
      return { message: 'Sub-subject updated successfully' };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to update sub-subject',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async deleteSubSubject(
    id: number,
    userId: number,
  ): Promise<{ message: string }> {
    try {
      const isAdmin = await this.adminRepository.findOne({
        where: { id: userId },
      });
      if (!isAdmin) {
        throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
      }

      const subSubject = await this.subSubjectRepository.findOne({
        where: { id, is_active: false },
        relations: ['created_by'],
      });

      if (!subSubject) {
        throw new HttpException('Sub-subject not found', HttpStatus.NOT_FOUND);
      }

      if (isAdmin.username !== subSubject.created_by.username) {
        throw new HttpException(
          'Only the creator can delete this sub-subject',
          HttpStatus.FORBIDDEN,
        );
      }

      await this.subSubjectRepository.update(id, { is_active: true });
      return { message: 'Sub-subject deleted successfully' };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to delete sub-subject',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Subject } from './subject.entity';
import { SubSubject } from './sub-subject.entity';
import { SubjectController } from './subject.controller';
import { SubjectService } from './subject.service';
import { AuthModule } from '../auth/auth.module';
import { AdminModule } from '../admin/admin.module';
import { Admin } from '../admin/admin.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Subject, SubSubject, Admin]),
    AuthModule,
    AdminModule,
  ],
  controllers: [SubjectController],
  providers: [SubjectService],
  exports: [SubjectService],
})
export class SubjectModule {}

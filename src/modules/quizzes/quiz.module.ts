import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Quiz, QuizAnswer } from './quiz.entity';
import { AdminModule } from '../admin/admin.module';
import { QuizController } from './quiz.controller';
import { QuizService } from './quiz.service';
import { SubSubject } from '../subjects/sub-subject.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Quiz, QuizAnswer, SubSubject]),
    AdminModule,
  ],
  controllers: [QuizController],
  providers: [QuizService],
  exports: [QuizService],
})
export class QuizModule {}
  
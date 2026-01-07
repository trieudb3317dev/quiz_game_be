import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QuizAnswer } from '../quizzes/quiz.entity';
import { JoinRoom } from '../join-rooms/join-room.entity';
import { AnswerSelect } from './ans-select.entity';
import { AuthModule } from '../auth/auth.module';
import { AnsSelectService } from './ans-select.service';
import { User } from '../users/user.entity';
import { GameResult } from '../game-results/game-result.entity';
import { AnswerSelectController } from './ans-select.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AnswerSelect,
      QuizAnswer,
      JoinRoom,
      User,
      GameResult,
    ]),
    AuthModule,
  ],
  controllers: [AnswerSelectController],
  providers: [AnsSelectService],
  exports: [AnsSelectService],
})
export class AnswerSelectModule {}

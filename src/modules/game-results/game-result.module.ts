import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GameResult } from './game-result.entity';
import { JoinRoom } from '../join-rooms/join-room.entity';
import { User } from '../users/user.entity';
import { GameResultService } from './game-result.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([GameResult, JoinRoom, User]),
    AuthModule,
  ],
  providers: [GameResultService],
  exports: [GameResultService],
})
export class GameResultModule {}

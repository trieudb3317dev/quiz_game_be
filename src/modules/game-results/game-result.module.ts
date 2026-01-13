import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GameResult } from './game-result.entity';
import { JoinRoom } from '../join-rooms/join-room.entity';
import { User } from '../users/user.entity';
import { GameResultService } from './game-result.service';
import { AuthModule } from '../auth/auth.module';
import { Room } from '../rooms/room.entity';
import { Session } from '../sessions/session.entity';
import { GameResultController } from './game-result.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([GameResult, JoinRoom, User, Room, Session]),
    AuthModule,
  ],
  providers: [GameResultService],
  controllers: [GameResultController],
  exports: [GameResultService],
})
export class GameResultModule {}

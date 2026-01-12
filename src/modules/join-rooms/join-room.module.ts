import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JoinRoom } from './join-room.entity';
import { Room } from '../rooms/room.entity';
import { User } from '../users/user.entity';
import { AuthModule } from '../auth/auth.module';
import { JoinRoomController } from './join-room.controller';
import { JoinRoomService } from './join-room.service';
import { Admin } from '../admin/admin.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([JoinRoom, Room, User, Admin]),
    AuthModule,
  ],
  controllers: [JoinRoomController],
  providers: [JoinRoomService],
  exports: [JoinRoomService],
})
export class JoinRoomModule {}

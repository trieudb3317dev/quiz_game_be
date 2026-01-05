import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Room } from './room.entity';
import { AdminModule } from '../admin/admin.module';
import { SubSubject } from '../subjects/sub-subject.entity';
import { RoomController } from './room.controller';
import { RoomService } from './room.service';
import { User } from '../users/user.entity';
import { Session } from '../sessions/session.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Room, SubSubject, User, Session]),
    AdminModule,
  ],
  controllers: [RoomController],
  providers: [RoomService],
  exports: [RoomService],
})
export class RoomModule {}

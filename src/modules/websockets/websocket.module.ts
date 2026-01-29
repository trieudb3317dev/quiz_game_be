import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { JoinRoomGateway } from './join-room.gateway';
import { JoinRoomModule } from '../join-rooms/join-room.module';
import { GameResultGateway } from './game-result.gateway';
import { SelectAnswerGateway } from './select-answer.gateway';
import { GameResultModule } from '../game-results/game-result.module';
import { AnswerSelectModule } from '../ans-selects/ans-select.module';
import { RoomModule } from '../rooms/room.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([]),
    JoinRoomModule,
    GameResultModule,
    RoomModule,
    AnswerSelectModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret:
          configService.get<string>('JWT_SECRET') || process.env.JWT_SECRET,
        signOptions: {
          expiresIn: configService.get<string>('JWT_ACCESS_EXPIRES_IN') || '7d',
        },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [JoinRoomGateway, GameResultGateway, SelectAnswerGateway],
  exports: [JoinRoomGateway, GameResultGateway, SelectAnswerGateway],
})
export class WebsocketModule {}

import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { JoinRoomGateway } from './join-room.gateway';
import { JoinRoomModule } from '../join-rooms/join-room.module';

@Module({
  imports: [
  TypeOrmModule.forFeature([]),
  JoinRoomModule,
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
  providers: [JoinRoomGateway],
  exports: [JoinRoomGateway],
})
export class WebsocketModule {}

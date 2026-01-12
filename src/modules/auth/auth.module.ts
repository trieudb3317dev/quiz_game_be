import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { AuthStrategy } from './auth.stratage';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { MailModule } from '../../shared/mail/mail.module';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret:
          configService.get('JWT_SECRET') ||
          process.env.JWT_SECRET ||
          'default_secret_key',
        signOptions: {
          expiresIn:
            configService.get('JWT_EXPIRES_IN') ||
            process.env.JWT_EXPIRES_IN ||
            '7d',
        },
      }),
      inject: [ConfigService],
    }),
    MailModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthStrategy, JwtService],
  exports: [AuthService],
})
export class AuthModule {}

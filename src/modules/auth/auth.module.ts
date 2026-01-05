import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { AuthStrategy } from './auth.stratage';
import { JwtService } from '@nestjs/jwt';
import { MailModule } from '../../shared/mail/mail.module';

@Module({
  imports: [TypeOrmModule.forFeature([User]), MailModule],
  controllers: [AuthController],
  providers: [AuthService, AuthStrategy, JwtService],
  exports: [AuthService],
})
export class AuthModule {}

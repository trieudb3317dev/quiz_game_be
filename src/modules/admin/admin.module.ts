import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Admin } from './admin.entity';
import { AdminStrategy } from './admin.stratage';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { JwtService } from '@nestjs/jwt';
import { MailModule } from 'src/shared/mail/mail.module';

@Module({
  imports: [TypeOrmModule.forFeature([Admin]), MailModule],
  controllers: [AdminController],
  providers: [AdminStrategy, AdminService, JwtService],
  exports: [AdminService],
})
export class AdminModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Admin } from './admin.entity';
import { AdminStrategy } from './admin.stratage';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { MailModule } from 'src/shared/mail/mail.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    TypeOrmModule.forFeature([Admin]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async () => ({
        secret:
          process.env.JWT_SECRET ||
          process.env.JWT_SECRET ||
          'admin-default-secret-key',
        signOptions: {
          expiresIn:
            process.env.JWT_EXPIRES_IN || process.env.JWT_EXPIRES_IN || '7d',
        },
      }),
    }),
    MailModule,
  ],
  controllers: [AdminController],
  providers: [AdminStrategy, AdminService, JwtService],
  exports: [AdminService],
})
export class AdminModule {}

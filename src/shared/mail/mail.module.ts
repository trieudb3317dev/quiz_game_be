import { Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { MailProvider } from './mail.provider';
import { MailDebugController } from './debug.controller';

@Module({
  providers: [MailProvider, MailService],
  controllers: [MailDebugController],
  exports: [MailService],
})
export class MailModule {} 
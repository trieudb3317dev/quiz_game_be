import { Controller, Get, Post, Body } from '@nestjs/common';
import { MailService } from './mail.service';
import { ConfigService } from '@nestjs/config';
import * as net from 'net';

@Controller('debug/mail')
export class MailDebugController {
  constructor(
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  status() {
    const host = this.configService.get<string>('SMTP_HOST');
    const port = this.configService.get<string>('SMTP_PORT');
    const from = this.configService.get<string>('SMTP_FROM');
    const userProvided = !!this.configService.get<string>('SMTP_USER');
    // transporter is a private property on MailService; inspect it at runtime
    const transporterPresent = !!(this.mailService as any).transporter;

    return {
      mailerConfigured: transporterPresent,
      host: host || null,
      port: port || null,
      from: from || null,
      userProvided,
    };
  }

  @Post('send-test')
  async sendTest(@Body() body: { to?: string }) {
    const to = body?.to || this.configService.get<string>('SMTP_FROM') || this.configService.get<string>('SMTP_USER');
    const result = await this.mailService.sendEmail({
      to,
      subject: 'Test email from deployed app',
      text: 'This is a test email from the deployed application.',
    });
    return { ok: true, result };
  }

  @Get('probe')
  async probe() {
    const hostRaw = this.configService.get<string>('SMTP_HOST') || 'smtp.gmail.com';
    const portRaw = this.configService.get<string>('SMTP_PORT') || '587';
    const host = hostRaw.replace(/^smtps?:\/\//i, '').replace(/\/$/, '');
    const port = parseInt(portRaw as any, 10) || 587;

    return new Promise((resolve) => {
      const socket = new net.Socket();
      let settled = false;
      socket.setTimeout(7000);
      socket.once('connect', () => {
        settled = true;
        socket.destroy();
        resolve({ reachable: true, host, port });
      });
      socket.once('timeout', () => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve({ reachable: false, reason: 'timeout', host, port });
      });
      socket.once('error', (err) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve({ reachable: false, reason: err && (err.message || err), host, port });
      });
      socket.connect(port, host);
    });
  }
}

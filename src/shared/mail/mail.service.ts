import { Injectable, Inject } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import * as sendgrid from '@sendgrid/mail';
import { ConfigService } from '@nestjs/config';

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
}

@Injectable()
export class MailService {
  private readonly fromEmail: string;
  private readonly fromName: string;
  private sendGridEnabled = false;

  constructor(
    @Inject('MAIL_TRANSPORTER') private transporter: nodemailer.Transporter,
    private configService: ConfigService,
  ) {
    this.fromEmail =
      this.configService.get<string>('SMTP_FROM') ||
      this.configService.get<string>('SMTP_USER');
    this.fromName = this.configService.get<string>(
      'SMTP_FROM_NAME',
      'NestJS App',
    );

    const sgKey = this.configService.get<string>('SENDGRID_API_KEY');
    if (sgKey) {
      try {
        sendgrid.setApiKey(sgKey);
        this.sendGridEnabled = true;
        console.log('🔁 SendGrid API enabled for mail delivery');
      } catch (err) {
        console.warn(
          '⚠️  Failed to initialize SendGrid client:',
          err && (err.message || err),
        );
      }
    }
  }

  async sendEmail(options: EmailOptions): Promise<nodemailer.SentMessageInfo> {
    const mailOptions: nodemailer.SendMailOptions = {
      from: `"${this.fromName}" <${this.fromEmail}>`,
      to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    };
    console.log(
      `📧 Sending email to: ${mailOptions.to} | Subject: ${mailOptions.subject}`,
    );

    // Prefer SendGrid HTTP API when available (more reliable from cloud hosts)
    if (this.sendGridEnabled) {
      try {
        const msg = {
          to: mailOptions.to,
          from: { email: this.fromEmail, name: this.fromName },
          subject: mailOptions.subject,
          html: mailOptions.html,
          text: mailOptions.text,
        } as any;
        const [response] = await sendgrid.send(msg);
        console.log(`✅ SendGrid accepted email to: ${mailOptions.to}`);
        return response as any;
      } catch (err: any) {
        console.error('❌ SendGrid send error:', err && (err.message || err));
        // Log detailed SendGrid response body when available (contains errors array)
        try {
          if (err && err.response && err.response.body) {
            console.error(
              '❌ SendGrid response body:',
              JSON.stringify(err.response.body),
            );
          }
        } catch (loggingErr) {
          // ignore
        }
        // fall through to SMTP transporter fallback
      }
    }

    // const result = await this.transporter.sendMail(mailOptions);
    // console.log(`✅ Email sent to: ${options.to}`);
    // return result;
  }

  async sendWelcomeEmail(
    to: string,
    username: string,
  ): Promise<nodemailer.SentMessageInfo> {
    return this.sendEmail({
      to,
      subject: 'Chào mừng bạn!',
      html: `
        <h2>Chào mừng ${username}!</h2>
        <p>Cảm ơn bạn đã đăng ký tài khoản.</p>
        <p>Email: ${to}</p>
      `,
    });
  }

  async sendPasswordResetEmail(
    to: string,
    resetToken: string,
    username: string,
  ): Promise<nodemailer.SentMessageInfo> {
    const resetUrl = `${this.configService.get<string>('FRONTEND_URL')}/reset-password?token=${resetToken}`;

    return this.sendEmail({
      to,
      subject: 'Đặt lại mật khẩu',
      html: `
        <h2>Xin chào ${username}!</h2>
        <p>Click vào link sau để đặt lại mật khẩu:</p>
        <a href="${resetUrl}">Đặt lại mật khẩu</a>
        <p>Link: ${resetUrl}</p>
      `,
    });
  }

  async sendNotificationEmail(
    to: string | string[],
    title: string,
    message: string,
  ): Promise<nodemailer.SentMessageInfo> {
    return this.sendEmail({
      to,
      subject: title,
      html: `
        <h2>${title}</h2>
        <p>${message}</p>
      `,
    });
  }

  async sendRegisterationConfirmationEmail(
    to: string,
    username: string,
    verificationToken: string,
  ): Promise<nodemailer.SentMessageInfo> {
    const verificationUrl = `${this.configService.get<string>('FRONTEND_URLS')}/verify-email?token=${verificationToken}`;

    return this.sendEmail({
      to,
      subject: 'Xác nhận đăng ký tài khoản',
      html: `
        <h2>Xin chào ${username}!</h2>
        <p>Cảm ơn bạn đã đăng ký tài khoản. Vui lòng xác nhận email của bạn bằng cách nhấp vào liên kết sau:</p>
        <a href="${verificationUrl}">Xác nhận email</a>
        <p>Link: ${verificationUrl}</p>
      `,
    });
  }
}

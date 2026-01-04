import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Admin, AdminRole } from './admin.entity';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { MailService } from 'src/shared/mail/mail.service';
import {
  AdminProfileDto,
  ResgisterAdminDto,
  ResponseAdminDto,
} from './admin.dto';
import * as bcrypt from 'bcrypt';
import { Response } from 'express';

@Injectable()
export class AdminService {
  // Implement admin guard logic here
  private readonly logger = new Logger(AdminService.name);
  constructor(
    @InjectRepository(Admin)
    private readonly adminRepository: Repository<Admin>,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
  ) {}

  // Register a new user
  async register(registerDto: ResgisterAdminDto): Promise<{ message: string }> {
    try {
      this.logger.log('Registering a new user');
      const { username, password, email, role } = registerDto;
      const existingUser = await this.adminRepository.findOne({
        where: { username },
      });
      if (existingUser) {
        throw new HttpException('Username already exists', 400);
      }
      const hashedPassword = await this.hashPassword(password);
      const newUser = this.adminRepository.create({
        username,
        password: hashedPassword,
        email,
        role:
          AdminRole[role.toUpperCase() as keyof typeof AdminRole] ||
          AdminRole.ADMIN,
      });
      await this.adminRepository.save(newUser);
      const verificationToken = await this.generateVerificationToken(newUser);
      await this.sendRegistrationConfirmationEmail(
        email,
        username,
        verificationToken,
      );
      this.logger.log(`User ${username} registered successfully`);
      return { message: 'User registered successfully' };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error('Error during user registration', error.stack);
      throw new HttpException(
        'Internal server error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async verifyEmail(token: string): Promise<{ message: string }> {
    try {
      this.logger.log('Verifying email with token');
      const payload = this.verifyJwtToken(token);
      const user = await this.adminRepository.findOne({
        where: { id: payload.userId },
      });
      if (!user) {
        throw new HttpException('Invalid token', 400);
      }
      user.is_verified = true;
      await this.adminRepository.save(user);
      this.logger.log(`User ${user.username} email verified successfully`);
      return { message: 'Email verified successfully' };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error('Error during email verification', error.stack);
      throw new HttpException(
        'Internal server error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async login(
    username: string,
    password: string,
    response: Response,
  ): Promise<{ message: string }> {
    try {
      this.logger.log(`Logging in user ${username}`);
      const user = await this.adminRepository.findOne({ where: { username } });
      if (!user) {
        throw new HttpException('Invalid credentials', 401);
      }
      const isPasswordValid = await this.comparePasswords(
        password,
        user.password,
      );
      if (!isPasswordValid) {
        throw new HttpException('Invalid credentials', 401);
      }
      this.generateJwtToken(user, response);
      this.generateRefreshToken(user, response);
      this.logger.log(`User ${username} logged in successfully`);
      return { message: 'User logged in successfully' };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error('Error during user login', error.stack);
      throw new HttpException(
        'Internal server error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async logout(response: Response): Promise<{ message: string }> {
    try {
      this.logger.log('Logging out user');
      response.clearCookie('jwt', {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
      });
      response.clearCookie('refreshJwt', {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
      });
      return { message: 'User logged out successfully' };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error('Error during user logout', error.stack);
      throw new HttpException(
        'Internal server error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async refreshToken(
    refreshToken: string,
    response: Response,
  ): Promise<{ message: string }> {
    try {
      // Implement refresh token logic here
      this.logger.log('Refreshing JWT token');
      const payload = this.verifyRefreshToken(refreshToken);
      const user = await this.adminRepository.findOne({
        where: { id: payload.userId },
      });
      if (!user) {
        throw new HttpException('Invalid refresh token', 401);
      }
      this.generateJwtToken(user, response);
      this.generateRefreshToken(user, response);
      this.logger.log(`JWT token refreshed for user ${user.username}`);
      return { message: 'Token refreshed successfully' };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error('Error during token refresh', error.stack);
      throw new HttpException(
        'Internal server error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    try {
      this.logger.log(`Processing forgot password for email ${email}`);
      const user = await this.adminRepository.findOne({ where: { email } });
      if (!user) {
        throw new HttpException('Email not found', 404);
      }
      const resetToken = await this.generateVerificationToken(user);
      await this.mailService.sendPasswordResetEmail(
        email,
        resetToken,
        user.username,
      );
      this.logger.log(`Sent password reset email to ${email}`);
      return { message: 'Password reset email sent successfully' };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error('Error during forgot password process', error.stack);
      throw new HttpException(
        'Internal server error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async me(userId: number): Promise<ResponseAdminDto> {
    // Implement logic to get current user info
    this.logger.log('Fetching current user info');
    const user = await this.adminRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }
    const responseUser: ResponseAdminDto = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      full_name: user.full_name,
      avatar_url: user.avatar_url,
      address: user.address,
      phone_number: user.phone_number,
      last_login: user.last_login,
      created_at: user.created_at,
    };
    return responseUser;
  }

  async validateUser(payload: any): Promise<Admin | null> {
    // Implement user validation logic here
    this.logger.log(`Validating user with ID ${payload.userId}`);
    const user = await this.adminRepository.findOne({
      where: { id: payload.userId },
    });
    if (!user) {
      return null;
    }
    return user;
  }

  async update(
    updateUserDto: AdminProfileDto,
    userId: number,
  ): Promise<{ message: string }> {
    // Implement user update logic here
    this.logger.log(`Updating user with ID ${userId}`);
    const user = await this.adminRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }
    await this.adminRepository.update(userId, updateUserDto);
    this.logger.log(`User with ID ${userId} updated successfully`);
    return { message: 'User updated successfully' };
  }

  private async hashPassword(password: string): Promise<string> {
    // Implement password hashing logic here
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    return hashedPassword;
  }

  private async comparePasswords(
    plainPassword: string,
    hashedPassword: string,
  ): Promise<boolean> {
    // Implement password comparison logic here
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  private generateJwtToken(user: Admin, response: Response): string {
    // Implement JWT token generation logic here
    const payload = {
      userId: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    };
    const token = this.jwtService.sign(payload, { expiresIn: '15m' });
    this.logger.log(`Generated JWT token for user ${user.username}`);
    response.cookie('jwt', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
    });
    return token;
  }

  private generateRefreshToken(user: Admin, response: Response): string {
    // Implement refresh token generation logic here
    const payload = {
      userId: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    };
    const token = this.jwtService.sign(payload, { expiresIn: '7d' });
    this.logger.log(`Generated refresh token for user ${user.username}`);
    response.cookie('refreshJwt', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
    });
    return token;
  }

  private verifyJwtToken(token: string): any {
    // Implement JWT token verification logic here
    const payload = this.jwtService.verify(token);
    this.logger.log(`Verified JWT token for user ${payload.userId}`);
    const decodedPayload = this.jwtService.decode(token);
    const now = Math.floor(Date.now() / 1000);
    if (
      decodedPayload &&
      typeof decodedPayload === 'object' &&
      decodedPayload.exp &&
      decodedPayload.exp < now
    ) {
      throw new HttpException('Token has expired', 401);
    }
    return payload;
  }

  private verifyRefreshToken(token: string): any {
    // Implement refresh token verification logic here
    const payload = this.jwtService.verify(token);
    this.logger.log(`Verified refresh token for user ${payload.userId}`);
    const decodedPayload = this.jwtService.decode(token);
    const now = Math.floor(Date.now() / 1000);
    if (
      decodedPayload &&
      typeof decodedPayload === 'object' &&
      decodedPayload.exp &&
      decodedPayload.exp < now
    ) {
      throw new HttpException('Token has expired', 401);
    }
    return payload;
  }

  private async sendRegistrationConfirmationEmail(
    email: string,
    username: string,
    token: string,
  ): Promise<void> {
    // Implement email sending logic here
    await this.mailService.sendRegisterationConfirmationEmail(
      email,
      username,
      token,
    );
    this.logger.log(
      `Sending password reset email to ${email} with token ${token}`,
    );
  }

  private async generateVerificationToken(user: Admin): Promise<string> {
    // Implement verification token generation logic here
    const payload = {
      userId: user.id,
      username: user.username,
      email: user.email,
    };
    const token = this.jwtService.sign(payload, { expiresIn: '15m' });
    this.logger.log(`Generated verification token for user ${user.username}`);
    return token;
  }
}

import { IsEnum, IsString, Min } from 'class-validator';

export class ResgisterAdminDto {
  @IsString({ message: 'Username must be a string' })
  @Min(4, { message: 'Username must be at least 4 characters long' })
  username: string;

  @IsString({ message: 'Email must be a string' })
  email: string;

  @IsString({ message: 'Password must be a string' })
  @Min(6, { message: 'Password must be at least 6 characters long' })
  password: string;

  @IsEnum(['super_admin', 'admin', 'moderator', 'content_manager'])
  role?: string;
}

export class LoginAdminDto {
  @IsString({ message: 'Username must be a string' })
  @Min(4, { message: 'Username must be at least 4 characters long' })
  username: string;

  @IsString({ message: 'Password must be a string' })
  @Min(6, { message: 'Password must be at least 6 characters long' })
  password: string;
}

export class RefreshAdminTokenDto {
  @IsString({ message: 'Refresh token must be a string' })
  refresh_token: string;
}

export class LogoutAdminDto {
  @IsString({ message: 'Refresh token must be a string' })
  refresh_token: string;
}

export class ForgotAdminPasswordDto {
  @IsString({
    message: 'Email must be a string',
  })
  email: string;
}

export class ResetAdminPasswordDto {
  @IsString({ message: 'Reset token must be a string' })
  reset_token: string;

  @IsString({ message: 'New password must be a string' })
  @Min(6, { message: 'New password must be at least 6 characters long' })
  new_password: string;
}

export class AdminProfileDto {
  @IsString({ message: 'Full name must be a string' })
  full_name?: string;
  @IsString({ message: 'Avatar URL must be a string' })
  avatar_url?: string;
  @IsString({ message: 'Address must be a string' })
  address?: string;
  @IsString({ message: 'Phone number must be a string' })
  phone_number?: string;
}

export class ResponseAdminDto {
  id: number;
  username: string;
  email: string;
  role: string;
  full_name?: string;
  avatar_url?: string;
  address?: string;
  phone_number?: string;
  last_login?: Date;
  created_at: Date;
}

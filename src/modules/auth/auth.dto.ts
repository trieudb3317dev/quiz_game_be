import { IsEmail, IsString, Min } from 'class-validator';

export class RegisterDto {
  @IsString({
    message: 'Username must be a string',
  })
  @Min(4, {
    message: 'Username must be at least 4 characters long',
  })
  username: string;

  @IsString({
    message: 'Password must be a string',
  })
  @Min(6, {
    message: 'Password must be at least 6 characters long',
  })
  password: string;

  @IsString({
    message: 'Email must be a string',
  })
  @IsEmail(
    {},
    {
      message: 'Email must be a valid email address',
    },
  )
  email: string;
}

export class LoginDto {
  @IsString({ message: 'Username must be a string' })
  @Min(4, { message: 'Username must be at least 4 characters long' })
  username: string;

  @IsString({ message: 'Password must be a string' })
  @Min(6, { message: 'Password must be at least 6 characters long' })
  password: string;
}

export class RefreshTokenDto {
  @IsString({ message: 'Refresh token must be a string' })
  refresh_token: string;
}

export class LogoutDto {
  @IsString({ message: 'Refresh token must be a string' })
  refresh_token: string;
}

export class ForgotPasswordDto {
  @IsString({
    message: 'Email must be a string',
  })
  @IsEmail(
    {},
    {
      message: 'Email must be a valid email address',
    },
  )
  email: string;
}

export class ResetPasswordDto {
  @IsString({
    message: 'Reset token must be a string',
  })
  reset_token: string;

  @IsString({
    message: 'New password must be a string',
  })
  @Min(6, {
    message: 'New password must be at least 6 characters long',
  })
  new_password: string;
}

export class UpdateUserDto {
  @IsString({
    message: 'Full name must be a string',
  })
  full_name?: string;
  @IsString({
    message: 'Avatar URL must be a string',
  })
  avatar_url?: string;
  @IsString({
    message: 'Address must be a string',
  })

  @IsString({
    message: 'Gender must be a string',
  })
  gender?: string;

  address?: string;
  @IsString({
    message: 'Phone number must be a string',
  })
  phone_number?: string;
}

export class ResponseDto {
  id: number;
  username: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  date_of_birth?: Date;
  gender?: string;
  address?: string;
  phone_number?: string;
  last_login?: Date;
  created_at: Date;
}

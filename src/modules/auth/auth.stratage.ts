import { HttpException, Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { User } from '../users/user.entity';
import { AuthService } from './auth.service';

@Injectable()
export class AuthStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private readonly authService: AuthService) {
    super({
      jwtFromRequest: (req) => {
        let token = null;
        if (req && req.cookies) {
          token = req.cookies['access_token'];
        }
        return token;
      },
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'defaultSecretKey',
    });
  }

  async validate(payload: any): Promise<User | any> {
    const user = await this.authService.validateUser(payload);
    if (!user || user.is_active === true) {
      throw new HttpException('Invalid token or user inactive', 401);
    }
    if (user.is_verified === false) {
      throw new HttpException('User email is not verified', 401);
    }
    return user;
  }
}

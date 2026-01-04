import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { Admin } from './admin.entity';

@Injectable()
export class AdminStrategy extends PassportStrategy(Strategy, 'jwt-admin') {
  // Implement admin guard logic here
  constructor() {
    super({
      jwtFromRequest: (req) => {
        let token = null;
        if (req && req.cookies) {
          token = req.cookies['access_token'];
        }
        return token;
      },
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_ADMIN_SECRET || 'defaultAdminSecretKey',
    });
  }

  async validate(payload: any): Promise<Admin | any> {
    // Implement admin validation logic here
    return payload;
  }
}

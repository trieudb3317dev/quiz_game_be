import { HttpException, Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { Admin } from './admin.entity';
import { AdminService } from './admin.service';

@Injectable()
export class AdminStrategy extends PassportStrategy(Strategy, 'jwt-admin') {
  // Implement admin guard logic here
  constructor(private readonly adminService: AdminService) {
    super({
      jwtFromRequest: (req) => {
        let token = null;
        if (req && req.cookies) {
          token = req.cookies['access_token'];
        }
        return token;
      },
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'defaultAdminSecretKey',
    });
  }

  async validate(payload: any): Promise<Admin | any> {
    const user = await this.adminService.validateUser(payload);
    if (!user || user.is_active === true) {
      throw new HttpException('Invalid token or user inactive', 401);
    }
    if (user.is_verified === false) {
      throw new HttpException('User email is not verified', 401);
    }
    return user;
  }
}

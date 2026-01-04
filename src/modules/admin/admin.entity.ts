import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum AdminRole {
  SUPER_ADMIN = 'super_admin',
  ADMIN = 'admin',
  MODERATOR = 'moderator',
  CONTENT_MANAGER = 'content_manager',
}

@Entity('user-admins')
export class Admin {
  // Define user entity properties and columns here
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  username: string;

  @Column()
  password: string;

  @Column({ unique: true })
  email: string;

  @Column({ type: 'enum', enum: AdminRole, default: AdminRole.ADMIN })
  role: AdminRole;

  @Column({ nullable: true })
  full_name: string;

  @Column({ nullable: true })
  avatar_url: string;

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  phone_number: string;

  @Column({ default: false })
  is_active: boolean;

  @Column({ default: false })
  is_verified: boolean;

  @Column({ nullable: true })
  last_login: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;
}

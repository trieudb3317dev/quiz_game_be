import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Subject } from './subject.entity';
import { Admin } from '../admin/admin.entity';
import { User } from '../users/user.entity';
import { Room } from '../rooms/room.entity';

@Entity('sub_subjects')
export class SubSubject {
  // Define sub-subject entity properties and columns here
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Subject, (subject) => subject.id, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  subject: Subject | null;

  @ManyToOne(() => Admin, (admin) => admin.id, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  created_by: Admin | null;

  @Column({ nullable: true })
  title: string;

  @Column({ nullable: true })
  slug: string;

  @Column({ nullable: true })
  image_url: string;

  @Column({ nullable: true })
  description: string;

  @Column({ type: 'int', default: 0 })
  total_quizzes: number;

  @Column({ type: 'int', default: 0 })
  total_rooms: number;

  @OneToMany(() => User, (user) => user.id, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  // Users enrolled in this sub-subject. Use ManyToMany with an explicit join table
  // because User does not have a back-reference defined.
  @OneToMany(() => User, (user) => user.id, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  enrolled_users: User[] | null;

  @OneToMany(() => Room, (room) => room.sub_subject, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  rooms: Room[] | null;

  @Column({ default: false })
  is_locked: boolean;

  @Column({ default: false })
  is_active: boolean;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;
}

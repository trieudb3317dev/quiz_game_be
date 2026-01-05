import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Session } from '../sessions/session.entity';
import { SubSubject } from '../subjects/sub-subject.entity';

@Entity('rooms')
export class Room {
  // Define room entity properties and columns here
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, (user) => user.id, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  created_by: User | null;

  @OneToOne(() => Session, (session) => session.id, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  @JoinColumn({name: 'session_id'})
  session: Session | null;

  @OneToOne(() => SubSubject, (subSubject) => subSubject.id, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({name: 'sub_subject_id'})
  sub_subject: SubSubject | null;

  @Column({ unique: true })
  name: string;

  @Column({ nullable: true })
  slug: string;

  @Column({ nullable: true })
  description: string;

  @Column({ default: false })
  is_active: boolean;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;
}

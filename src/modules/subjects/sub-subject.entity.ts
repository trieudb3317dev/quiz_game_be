import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Subject } from './subject.entity';
import { Admin } from '../admin/admin.entity';

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

  @Column({ default: false })
  is_active: boolean;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;
}

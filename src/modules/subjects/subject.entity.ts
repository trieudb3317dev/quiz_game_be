import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Admin } from '../admin/admin.entity';

export enum FieldType {
  NULL = 'null',
  SCIENCE = 'science',
  MATH = 'math',
  HISTORY = 'history',
  LITERATURE = 'literature',
  ART = 'art',
  TECHNOLOGY = 'technology',
  SPORTS = 'sports',
  MUSIC = 'music',
  GEOGRAPHY = 'geography',
  LANGUAGE = 'language',
}

@Entity('subjects')
export class Subject {
  // Define subject entity properties and columns here
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Admin, (admin) => admin.id, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  created_by: Admin | null;

  @Column({ type: 'enum', enum: FieldType, default: FieldType.NULL })
  field_type: FieldType;

  @Column({ unique: true })
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

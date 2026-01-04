import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum SessionType {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  REJECTED = 'rejected',
}

@Entity('sessions')
export class Session {
  // Define session entity properties and columns here
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  token: string;

  @Column({ type: 'enum', enum: SessionType, default: SessionType.PENDING })
  type: SessionType;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;
}

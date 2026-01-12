import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { JoinRoom } from '../join-rooms/join-room.entity';

@Entity('game_results')
export class GameResult {
  // Define game result entity properties and columns here
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => JoinRoom, (joinRoom) => joinRoom.id, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'join_room_id' })
  join_room: JoinRoom;

  @Column({ default: 0 })
  score: number;

  @Column({ default: 0 })
  speed_bonus: number;

  @Column({ default: 0 })
  accuracy_bonus: number;

  @Column({ default: 0 })
  total_score: number;

  @Column({ default: false })
  correct: boolean;

  @Column({ nullable: true })
  answer_select_id: number;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;
}

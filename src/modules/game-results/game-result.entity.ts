import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { JoinRoom } from '../join-rooms/join-room.entity';
import { AnswerSelect } from '../ans-selects/ans-select.entity';

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

  @OneToOne(() => AnswerSelect, (ansSelect) => ansSelect.id, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'answer_select_id' })
  answer_select: AnswerSelect;

  @Column({ default: 0 })
  score: number;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;
}

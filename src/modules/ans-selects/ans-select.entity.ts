import {
  Column,
  Entity,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { QuizAnswer } from '../quizzes/quiz.entity';
import { JoinRoom } from '../join-rooms/join-room.entity';

@Entity('answer_selects')
export class AnswerSelect {
  // Define ans select entity properties and columns here
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => QuizAnswer, (quizAnswer) => quizAnswer.id, {
    onDelete: 'CASCADE',
  })
  quiz_answer: QuizAnswer;

  @ManyToOne(() => JoinRoom, (joinRoom) => joinRoom.id, {
    onDelete: 'CASCADE',
  })
  join_room: JoinRoom;

  @Column({ default: 0 })
  select_count: number;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;
}
